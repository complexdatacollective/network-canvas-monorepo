terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.62.0"
    }
    b2 = {
      source  = "Backblaze/b2"
      version = "0.13.2"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.24.0"
    }
    crunchybridge = {
      source  = "CrunchyData/crunchybridge"
      version = "0.3.0"
    }
  }
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
