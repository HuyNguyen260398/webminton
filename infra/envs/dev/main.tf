terraform {
  backend "s3" {
    key     = "webminton/dev/terraform.tfstate"
    encrypt = true
  }
}
provider "aws" { region = var.region }
module "stack" {
  source                = "../../modules/stack"
  region                = var.region
  name_prefix           = var.name_prefix
  lambda_zip_path       = var.lambda_zip_path
  site_bucket_name      = var.site_bucket_name
  callback_urls         = var.callback_urls
  logout_urls           = var.logout_urls
  cognito_domain_prefix = var.cognito_domain_prefix
}
output "site_bucket_name" { value = module.stack.site_bucket_name }
output "data_bucket_name" { value = module.stack.data_bucket_name }
output "distribution_id" { value = module.stack.distribution_id }
output "site_url" { value = module.stack.site_url }
output "user_pool_id" { value = module.stack.user_pool_id }
output "user_pool_client_id" { value = module.stack.user_pool_client_id }
output "cognito_domain" { value = module.stack.cognito_domain }
output "lambda_function_name" { value = module.stack.lambda_function_name }
