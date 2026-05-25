-- ============================================================
--  ADIR Gestión de Obras — Esquema MySQL / MariaDB
--  Base de datos: adirg_bbdd (Dinahosting)
--  Prefijo de tablas: ctcon_  (BD compartida)
--  Codificación: utf8mb4
--  Generado: 2026-05-25
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────
--  1. ctcon_propuestas (proyectos)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_propuestas` (
  `Proyecto`         VARCHAR(200) NOT NULL          COMMENT 'ID único BC3 del proyecto',
  `cliente`          VARCHAR(255) DEFAULT NULL       COMMENT 'Nombre del cliente',
  `direccion`        VARCHAR(255) DEFAULT NULL       COMMENT 'Email de contacto del cliente',
  `jefe_obra`        VARCHAR(100) DEFAULT NULL       COMMENT 'Nombre del jefe de obra asignado',
  `estado`           VARCHAR(30)  NOT NULL DEFAULT 'Borrador'
                     COMMENT 'Pendiente | Borrador | En Revisión | En Curso | Finalizado',
  `fecha_recepcion`  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `descripcion`      TEXT         DEFAULT NULL       COMMENT 'Nombre legible del proyecto (editable)',
  `created_at`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`Proyecto`),
  INDEX `idx_ctcon_prop_estado`          (`estado`),
  INDEX `idx_ctcon_prop_jefe_obra`       (`jefe_obra`),
  INDEX `idx_ctcon_prop_fecha_recepcion` (`fecha_recepcion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  2. ctcon_partidas (líneas de presupuesto)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_partidas` (
  `id`                      CHAR(36)       NOT NULL,
  `propuesta_id`            VARCHAR(200)   NOT NULL,
  `capitulo_codigo`         VARCHAR(100)   DEFAULT NULL  COMMENT 'Código BC3 (ej: 01.02.03 o 01#)',
  `descripcion`             TEXT           DEFAULT NULL,
  `precio_base_estimado`    DECIMAL(12,2)  DEFAULT 0.00  COMMENT 'Precio unitario BC3 original',
  `precio_adjudicado`       DECIMAL(12,2)  DEFAULT NULL  COMMENT 'Precio final aprobado',
  `cantidad`                DECIMAL(12,3)  DEFAULT 0.000,
  `unidad`                  VARCHAR(20)    DEFAULT NULL,
  `oficio_asignado`         VARCHAR(100)   DEFAULT NULL,
  `proveedor_adjudicado_id` VARCHAR(36)    DEFAULT NULL,
  `estado_adjudicacion`     VARCHAR(30)    DEFAULT NULL,
  `created_at`              DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ctcon_part_propuesta`  (`propuesta_id`),
  INDEX `idx_ctcon_part_capitulo`   (`capitulo_codigo`),
  INDEX `idx_ctcon_part_oficio`     (`oficio_asignado`),
  CONSTRAINT `fk_ctcon_partidas_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  3. ctcon_presupuestos_cliente
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_presupuestos_cliente` (
  `id`                   CHAR(36)      NOT NULL,
  `token`                CHAR(36)      NOT NULL UNIQUE,
  `propuesta_id`         VARCHAR(200)  NOT NULL,
  `cliente_nombre`       VARCHAR(255)  DEFAULT NULL,
  `cliente_email`        VARCHAR(255)  DEFAULT NULL,
  `proyecto_descripcion` VARCHAR(500)  DEFAULT NULL,
  `partidas`             LONGTEXT      DEFAULT NULL  COMMENT 'Snapshot JSON (campos mínimos)',
  `precio_total`         DECIMAL(12,2) DEFAULT 0.00,
  `fecha_envio`          DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `estado`               VARCHAR(30)   NOT NULL DEFAULT 'pendiente'
                         COMMENT 'pendiente | firmado | rechazado | firmado_archivado | rechazado_archivado',
  `firma_url`            VARCHAR(500)  DEFAULT NULL  COMMENT 'URL fichero de firma (storage)',
  `firma_base64`         LONGTEXT      DEFAULT NULL  COMMENT 'Backup base64 (migración)',
  `fecha_firma`          DATETIME      DEFAULT NULL,
  `detalles_rechazo`     TEXT          DEFAULT NULL,
  `created_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ctcon_presup_token` (`token`),
  INDEX `idx_ctcon_presup_propuesta`  (`propuesta_id`),
  INDEX `idx_ctcon_presup_estado`     (`estado`),
  INDEX `idx_ctcon_presup_fecha`      (`fecha_envio`),
  CONSTRAINT `fk_ctcon_presupuesto_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  4. ctcon_proveedores
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_proveedores` (
  `id`               VARCHAR(36)   NOT NULL,
  `nombre_empresa`   VARCHAR(255)  NOT NULL,
  `oficio_principal` VARCHAR(100)  DEFAULT NULL,
  `email`            VARCHAR(255)  DEFAULT NULL,
  `telefono`         VARCHAR(30)   DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ctcon_prov_oficio` (`oficio_principal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  5. ctcon_solicitudes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_solicitudes` (
  `id`                CHAR(36)      NOT NULL,
  `propuesta_id`      VARCHAR(200)  NOT NULL,
  `proveedor_id`      VARCHAR(36)   DEFAULT NULL,
  `proveedor_nombre`  VARCHAR(255)  DEFAULT NULL,
  `proveedor_email`   VARCHAR(255)  DEFAULT NULL,
  `estado_solicitud`  VARCHAR(30)   DEFAULT 'Enviada',
  `created_at`        DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ctcon_sol_propuesta`  (`propuesta_id`),
  INDEX `idx_ctcon_sol_proveedor`  (`proveedor_id`),
  INDEX `idx_ctcon_sol_estado`     (`estado_solicitud`),
  CONSTRAINT `fk_ctcon_solicitud_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  6. ctcon_respuestas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_respuestas` (
  `id`              CHAR(36)      NOT NULL,
  `solicitud_id`    CHAR(36)      NOT NULL,
  `partida_id`      CHAR(36)      NOT NULL,
  `precio_ofertado` DECIMAL(12,2) DEFAULT NULL,
  `comentarios`     TEXT          DEFAULT NULL,
  `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ctcon_resp_solicitud` (`solicitud_id`),
  INDEX `idx_ctcon_resp_partida`   (`partida_id`),
  CONSTRAINT `fk_ctcon_respuesta_solicitud`
    FOREIGN KEY (`solicitud_id`) REFERENCES `ctcon_solicitudes` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  7. ctcon_historial_cambios
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_historial_cambios` (
  `id`                   BIGINT        NOT NULL AUTO_INCREMENT,
  `origen_cambio`        VARCHAR(100)  DEFAULT NULL,
  `tipo_entidad`         VARCHAR(50)   DEFAULT NULL,
  `entidad_id`           VARCHAR(200)  DEFAULT NULL,
  `proyecto_referencia`  VARCHAR(200)  DEFAULT NULL,
  `campo_modificado`     VARCHAR(100)  DEFAULT NULL,
  `valor_anterior`       TEXT          DEFAULT NULL,
  `valor_nuevo`          TEXT          DEFAULT NULL,
  `detalles`             TEXT          DEFAULT NULL,
  `created_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ctcon_hist_proyecto`   (`proyecto_referencia`),
  INDEX `idx_ctcon_hist_created`    (`created_at`),
  INDEX `idx_ctcon_hist_origen`     (`origen_cambio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  8. ctcon_base_precios
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_base_precios` (
  `id`                CHAR(36)      NOT NULL,
  `codigo`            VARCHAR(100)  DEFAULT NULL,
  `descripcion_corta` VARCHAR(500)  DEFAULT NULL,
  `descripcion_larga` LONGTEXT      DEFAULT NULL,
  `tags`              TEXT          DEFAULT NULL,
  `unidad`            VARCHAR(20)   DEFAULT NULL,
  `tipo_partida`      VARCHAR(30)   DEFAULT NULL,
  `precio_total`      DECIMAL(12,4) DEFAULT NULL,
  `mano_de_obra`      DECIMAL(12,4) DEFAULT NULL,
  `ratio_mo`          DECIMAL(5,4)  DEFAULT NULL,
  `origen`            VARCHAR(100)  DEFAULT NULL,
  `created_at`        DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ctcon_bp_codigo`  (`codigo`),
  INDEX `idx_ctcon_bp_tipo`    (`tipo_partida`),
  INDEX `idx_ctcon_bp_unidad`  (`unidad`),
  FULLTEXT INDEX `ft_ctcon_bp_desc` (`descripcion_corta`, `tags`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  9. ctcon_configuracion
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ctcon_configuracion` (
  `clave`      VARCHAR(100)  NOT NULL,
  `valor`      TEXT          DEFAULT NULL,
  `updated_at` DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `ctcon_configuracion` (`clave`, `valor`) VALUES ('mistral_api_key', '');

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
--  FIN DEL ESQUEMA — importar PRIMERO este fichero,
--  luego el fichero de datos generado por migrar_supabase_a_mysql.cjs
-- ============================================================
