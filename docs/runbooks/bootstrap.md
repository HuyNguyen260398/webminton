# Bootstrap AWS

Create a private, versioned state bucket once with `infra/bootstrap` using an
operator profile. Supply a globally unique bucket name and the repository name;
never commit `terraform.tfstate` or real account values. After applying, pass
the bucket name to each environment's S3 backend at `terraform init`.

The application stack creates its own private site and data buckets. It never
manages the JSON object contents; initialize that object separately with the
create-only seed command after reviewing the deployment plan.
