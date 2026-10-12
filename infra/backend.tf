# ------------------------------------------------------------------ database
# One item holds the current tournament; one more per version is the history.
resource "aws_dynamodb_table" "tournament" {
  name                        = "${var.name_prefix}-tournament"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "pk"
  range_key                   = "sk"
  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  point_in_time_recovery {
    enabled = true
  }
}

# -------------------------------------------------------------------- lambda
data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../backend/dist/index.mjs"
  output_path = "${path.module}/.build/api.zip"
}

resource "aws_iam_role" "api" {
  name = "${var.name_prefix}-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name_prefix}-api"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "api" {
  name = "${var.name_prefix}-api"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Tournament"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
        ]
        Resource = aws_dynamodb_table.tournament.arn
      },
      {
        # The whole point of the narrow resource: a bug in the Lambda cannot
        # overwrite the page itself.
        Sid      = "PublishSnapshot"
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.site.arn}/tournament.json"
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.api.arn}:*"
      },
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.name_prefix}-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      TABLE_NAME        = aws_dynamodb_table.tournament.name
      SITE_BUCKET       = aws_s3_bucket.site.id
      ADMIN_EMAILS      = join(",", var.admin_emails)
      COGNITO_DOMAIN    = local.cognito_domain
      COGNITO_CLIENT_ID = aws_cognito_user_pool_client.admin.id
    }
  }
  depends_on = [aws_cloudwatch_log_group.api]
}

# ------------------------------------------------------------------ http api
resource "aws_apigatewayv2_api" "api" {
  name          = "${var.name_prefix}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.api.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    audience = [aws_cognito_user_pool_client.admin.id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.admin.id}"
  }
}

resource "aws_apigatewayv2_route" "config" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api/config"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

# Open on purpose: athletes draw their own team on /boc-tham without signing
# in. The Lambda refuses it unless the organiser has opened the draw, and an
# athlete who has a team cannot roll again.
resource "aws_apigatewayv2_route" "team_draw" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api/team-draw"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

# Open on purpose: referees score their own match on /trong-tai without
# signing in. The Lambda refuses every call unless the organiser has switched
# refereeing on and the request carries the code the organiser set.
resource "aws_apigatewayv2_route" "referee" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api/referee/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "admin" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "ANY /api/admin/{proxy+}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_rate_limit  = 20
    throttling_burst_limit = 40
  }
  # Fourteen people roll once each; anything faster than this is not them.
  route_settings {
    route_key              = aws_apigatewayv2_route.team_draw.route_key
    throttling_rate_limit  = 2
    throttling_burst_limit = 5
  }
  # Two courts, each saving at most twice a second. At this rate a six-digit
  # code takes about fourteen hours to guess on average.
  route_settings {
    route_key              = aws_apigatewayv2_route.referee.route_key
    throttling_rate_limit  = 10
    throttling_burst_limit = 20
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
