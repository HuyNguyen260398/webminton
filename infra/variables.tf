variable "region" {
  type        = string
  description = "Vùng AWS cho bucket và CloudFront."
  default     = "ap-southeast-1"
}

variable "name_prefix" {
  type        = string
  description = "Tiền tố đặt tên tài nguyên."
  default     = "webminton"
}

variable "site_bucket_name" {
  type        = string
  description = "Tên bucket chứa bản build tĩnh."
}

variable "domain_name" {
  type        = string
  description = "Tên miền phục vụ trang."
  default     = "giaicaulong2026.nghuy.link"
}

variable "google_client_id" {
  type        = string
  description = "Client ID của OAuth client Google (loại Web application)."
}

variable "google_client_secret" {
  type        = string
  description = "Client secret của OAuth client Google."
  sensitive   = true
}

variable "admin_emails" {
  type        = list(string)
  description = "Các email Google được phép vào trang quản trị."
}
