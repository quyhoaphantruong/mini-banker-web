terraform {
  backend "s3" {
    key = "envs/dev/terraform.tfstate"
    region = "ap-southeast-2"
    dynamodb_table = "bdsmini-tflock"
    encrypt = true
  }
}