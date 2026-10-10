# ------------------------------------------------------------------ sign-in
# Google is the only way in. The pool exists to turn a Google login into a
# token the HTTP API can verify; who counts as an organiser is decided by the
# Lambda's allow-list, not by membership of this pool.
data "aws_caller_identity" "current" {}

locals {
  cognito_prefix = "${var.name_prefix}-${data.aws_caller_identity.current.account_id}"
  cognito_domain = "${local.cognito_prefix}.auth.${var.region}.amazoncognito.com"
}

resource "aws_cognito_user_pool" "admin" {
  name                = "${var.name_prefix}-admin"
  deletion_protection = "ACTIVE"
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.admin.id
  provider_name = "Google"
  provider_type = "Google"
  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email"
  }
  # Without email_verified mapped, the ID token says "false" and the Lambda
  # refuses everyone.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }
}

resource "aws_cognito_user_pool_domain" "admin" {
  domain       = local.cognito_prefix
  user_pool_id = aws_cognito_user_pool.admin.id
}

resource "aws_cognito_user_pool_client" "admin" {
  name                                 = "${var.name_prefix}-admin-web"
  user_pool_id                         = aws_cognito_user_pool.admin.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["Google"]
  callback_urls = [
    "https://${var.domain_name}/quan-tri/",
    "http://localhost:3100/quan-tri/",
  ]
  logout_urls = [
    "https://${var.domain_name}/quan-tri/",
    "http://localhost:3100/quan-tri/",
  ]
  id_token_validity      = 12
  access_token_validity  = 12
  refresh_token_validity = 1
  token_validity_units {
    id_token      = "hours"
    access_token  = "hours"
    refresh_token = "days"
  }
  depends_on = [aws_cognito_identity_provider.google]
}
