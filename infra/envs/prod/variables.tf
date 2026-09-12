variable "region" { type = string }
variable "name_prefix" { type = string }
variable "site_bucket_name" { type = string }
variable "lambda_zip_path" { type = string }
variable "callback_urls" { type = list(string) }
variable "logout_urls" { type = list(string) }
variable "lambda_role_arn" { type = string }
