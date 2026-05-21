output "public_ip" {
  value = alicloud_instance.app.public_ip
}

output "showcase_url" {
  value = "http://${alicloud_instance.app.public_ip}:8501"
}
