data "alicloud_zones" "available" {
  available_resource_creation = "VSwitch"
}

data "alicloud_images" "ubuntu" {
  name_regex  = "^ubuntu_22_04"
  owners      = "system"
  most_recent = true
}

locals {
  zone_id = var.zone_id != "" ? var.zone_id : data.alicloud_zones.available.zones[0].id
}

resource "alicloud_vpc" "main" {
  vpc_name   = "modelstudio-showcase-vpc"
  cidr_block = "10.42.0.0/16"
}

resource "alicloud_vswitch" "main" {
  vpc_id       = alicloud_vpc.main.id
  zone_id      = local.zone_id
  cidr_block   = "10.42.1.0/24"
  vswitch_name = "modelstudio-showcase-vswitch"
}

resource "alicloud_security_group" "main" {
  name        = "modelstudio-showcase-sg"
  description = "Model Studio showcase"
  vpc_id      = alicloud_vpc.main.id
}

resource "alicloud_security_group_rule" "showcase" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "8501/8501"
  security_group_id = alicloud_security_group.main.id
  cidr_ip           = var.allowed_cidr
}

resource "alicloud_security_group_rule" "ssh" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "22/22"
  security_group_id = alicloud_security_group.main.id
  cidr_ip           = var.allowed_cidr
}

resource "alicloud_key_pair" "main" {
  key_pair_name = "modelstudio-showcase-key"
  public_key    = var.ssh_public_key
}

resource "alicloud_instance" "app" {
  instance_name              = "modelstudio-showcase"
  image_id                   = data.alicloud_images.ubuntu.images[0].id
  instance_type              = var.instance_type
  security_groups            = [alicloud_security_group.main.id]
  vswitch_id                 = alicloud_vswitch.main.id
  internet_max_bandwidth_out = 10
  system_disk_category       = "cloud_essd"
  system_disk_size           = var.system_disk_size
  key_name                   = alicloud_key_pair.main.key_pair_name

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    dashscope_api_key = var.dashscope_api_key
    repo_url          = var.repo_url
    app_subdir        = var.app_subdir
  })
}
