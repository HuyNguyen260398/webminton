variable "site_bucket_name" {
  type        = string
  description = "Bucket chứa bản build tĩnh — phải khớp site_bucket_name của infra/."
  default     = null
}

variable "distribution_id" {
  type        = string
  description = "CloudFront distribution của trang, lấy từ output của infra/."
  default     = null
}

variable "hosted_zone_id" {
  type        = string
  description = "Route53 zone nghuy.link."
  default     = null
}
