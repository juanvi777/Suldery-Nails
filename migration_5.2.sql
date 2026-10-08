-- Suldery Nails v5.2 - migración de funcionalidades nuevas
-- Se puede ejecutar manualmente en MySQL si prefieres migrar antes de arrancar el servidor.
ALTER TABLE users ADD COLUMN review_submitted TINYINT(1) NOT NULL DEFAULT 0 AFTER created_at;
ALTER TABLE reviews ADD COLUMN image_data MEDIUMBLOB NULL AFTER comment;
ALTER TABLE reviews ADD COLUMN image_mime VARCHAR(80) NULL AFTER image_data;
ALTER TABLE portfolio_photos ADD COLUMN image_hash CHAR(64) NULL AFTER display_order;
ALTER TABLE catalog_photos ADD COLUMN image_hash CHAR(64) NULL AFTER display_order;

CREATE TABLE IF NOT EXISTS client_photo_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  message VARCHAR(1000) NULL,
  image_data MEDIUMBLOB NOT NULL,
  image_mime VARCHAR(80) NOT NULL,
  status ENUM('unread','read') NOT NULL DEFAULT 'unread',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_client_photo_messages_user_created (user_id, created_at),
  KEY idx_client_photo_messages_status (status, created_at),
  CONSTRAINT fk_client_photo_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE users u JOIN (SELECT DISTINCT user_id FROM reviews) r ON r.user_id=u.id SET u.review_submitted=1 WHERE u.review_submitted=0;
