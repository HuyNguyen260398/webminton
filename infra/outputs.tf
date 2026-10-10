output "site_bucket_name" { value = aws_s3_bucket.site.id }
output "distribution_id" { value = aws_cloudfront_distribution.site.id }
output "site_url" { value = "https://${var.domain_name}" }
output "table_name" { value = aws_dynamodb_table.tournament.name }
output "cognito_domain" { value = local.cognito_domain }
output "cognito_client_id" { value = aws_cognito_user_pool_client.admin.id }
output "google_redirect_uri" { value = "https://${local.cognito_domain}/oauth2/idpresponse" }
