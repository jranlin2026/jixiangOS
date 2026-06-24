CREATE DATABASE IF NOT EXISTS jixiang_os
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'jixiang_os'@'localhost' IDENTIFIED BY 'jixiang_os_dev';
CREATE USER IF NOT EXISTS 'jixiang_os'@'127.0.0.1' IDENTIFIED BY 'jixiang_os_dev';

GRANT ALL PRIVILEGES ON jixiang_os.* TO 'jixiang_os'@'localhost';
GRANT ALL PRIVILEGES ON jixiang_os.* TO 'jixiang_os'@'127.0.0.1';

FLUSH PRIVILEGES;
