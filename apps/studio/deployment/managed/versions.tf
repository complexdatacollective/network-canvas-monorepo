terraform {
  required_version = ">= 1.10.0, < 2.0.0"

}

provider "aws" {
  region = "us-east-1"
}

provider "b2" {
  application_key    = var.b2_application_key
  application_key_id = var.b2_application_key_id
  endpoint           = var.b2_endpoint
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "crunchybridge" {
  application_secret = var.crunchybridge_application_secret
}
