output "site_bucket_name" { value = aws_s3_bucket.site.id }
output "data_bucket_name" { value = aws_s3_bucket.data.id }
output "distribution_id" { value = "managed-after-bootstrap" }
output "site_url" { value = "https://example.invalid" }
output "user_pool_id" { value = aws_cognito_user_pool.admins.id }
output "user_pool_client_id" { value = aws_cognito_user_pool_client.spa.id }
output "cognito_domain" { value = aws_cognito_user_pool_domain.main.domain }
output "lambda_function_name" { value = aws_lambda_function.api.function_name }
