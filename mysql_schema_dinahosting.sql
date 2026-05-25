-- ============================================================
--  ADIR Gestión de Obras — Esquema MySQL / MariaDB
--  Base de datos: adirg_bbdd (Dinahosting)
--  Prefijo: ctcon_
--  IDs: BIGINT AUTO_INCREMENT (limpios, numéricos)
--  Los códigos BC3 originales se conservan en columnas _bc3 / codigo_bc3
--  Generado: 2026-05-25
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `ctcon_respuestas`;
DROP TABLE IF EXISTS `ctcon_solicitudes`;
DROP TABLE IF EXISTS `ctcon_partidas`;
DROP TABLE IF EXISTS `ctcon_presupuestos_cliente`;
DROP TABLE IF EXISTS `ctcon_propuestas`;
DROP TABLE IF EXISTS `ctcon_proveedores`;
DROP TABLE IF EXISTS `ctcon_historial_cambios`;
DROP TABLE IF EXISTS `ctcon_base_precios_adir`;
DROP TABLE IF EXISTS `ctcon_precios_cype`;
DROP TABLE IF EXISTS `ctcon_configuracion`;


-- ─────────────────────────────────────────────────────────────
--  1. ctcon_propuestas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_propuestas` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT  COMMENT 'PK numérica limpia',
  `proyecto_bc3`     VARCHAR(200)  NOT NULL UNIQUE          COMMENT 'Código BC3 original (ej: 25007__REFORM__...)',
  `cliente`          VARCHAR(255)  DEFAULT NULL,
  `direccion`        VARCHAR(255)  DEFAULT NULL             COMMENT 'Email cliente',
  `jefe_obra`        VARCHAR(100)  DEFAULT NULL,
  `estado`           VARCHAR(30)   NOT NULL DEFAULT 'Borrador'
                     COMMENT 'Pendiente | Borrador | En Revisión | En Curso | Finalizado',
  `fecha_recepcion`  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `descripcion`      TEXT          DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_proyecto_bc3`  (`proyecto_bc3`),
  INDEX `idx_prop_estado`       (`estado`),
  INDEX `idx_prop_jefe`         (`jefe_obra`),
  INDEX `idx_prop_fecha`        (`fecha_recepcion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  2. ctcon_partidas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_partidas` (
  `id`                      BIGINT        NOT NULL AUTO_INCREMENT  COMMENT 'PK numérica limpia',
  `id_bc3`                  VARCHAR(150)  DEFAULT NULL  UNIQUE     COMMENT 'ID BC3 original de Supabase',
  `propuesta_id`            BIGINT        NOT NULL                 COMMENT 'FK → ctcon_propuestas.id',
  `propuesta_bc3`           VARCHAR(200)  DEFAULT NULL             COMMENT 'Copia del código BC3 del proyecto',
  -- Código y descripción (separados del texto_partida original)
  `capitulo_codigo`         VARCHAR(100)  DEFAULT NULL,
  `descripcion`             TEXT          DEFAULT NULL,
  `texto_partida`           TEXT          DEFAULT NULL             COMMENT 'Formato original: COD::Descripción (backup)',
  -- Precios
  `precio_base_estimado`    DECIMAL(12,2) DEFAULT 0.00,
  `precio_adjudicado`       DECIMAL(12,2) DEFAULT NULL,
  `precio_ia`               DECIMAL(12,2) DEFAULT NULL,
  -- Medición
  `cantidad`                DECIMAL(12,3) DEFAULT 0.000,
  `unidad`                  VARCHAR(20)   DEFAULT NULL,
  -- Asignación
  `oficio_asignado`         VARCHAR(100)  DEFAULT NULL,
  `proveedor_adjudicado_id` BIGINT        DEFAULT NULL,
  `estado_adjudicacion`     VARCHAR(30)   DEFAULT NULL,
  `force_quote`             TINYINT(1)    DEFAULT 0,
  `created_at`              DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_id_bc3`          (`id_bc3`),
  INDEX `idx_part_propuesta`      (`propuesta_id`),
  INDEX `idx_part_propuesta_bc3`  (`propuesta_bc3`(100)),
  INDEX `idx_part_capitulo`       (`capitulo_codigo`),
  INDEX `idx_part_oficio`         (`oficio_asignado`),
  CONSTRAINT `fk_part_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  3. ctcon_presupuestos_cliente
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_presupuestos_cliente` (
  `id`                   BIGINT        NOT NULL AUTO_INCREMENT,
  `id_bc3`               CHAR(36)      DEFAULT NULL UNIQUE  COMMENT 'UUID original de Supabase',
  `token`                CHAR(36)      NOT NULL UNIQUE      COMMENT 'Token público para el portal',
  `propuesta_id`         BIGINT        NOT NULL,
  `propuesta_bc3`        VARCHAR(200)  DEFAULT NULL,
  `cliente_nombre`       VARCHAR(255)  DEFAULT NULL,
  `cliente_email`        VARCHAR(255)  DEFAULT NULL,
  `proyecto_descripcion` VARCHAR(500)  DEFAULT NULL,
  `partidas`             LONGTEXT      DEFAULT NULL         COMMENT 'JSON snapshot (campos mínimos)',
  `precio_total`         DECIMAL(12,2) DEFAULT 0.00,
  `fecha_envio`          DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `estado`               VARCHAR(30)   NOT NULL DEFAULT 'pendiente',
  `firma_base64`         LONGTEXT      DEFAULT NULL,
  `firma_url`            VARCHAR(500)  DEFAULT NULL,
  `fecha_firma`          DATETIME      DEFAULT NULL,
  `detalles_rechazo`     TEXT          DEFAULT NULL,
  `created_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_token`           (`token`),
  INDEX `idx_presup_propuesta`    (`propuesta_id`),
  INDEX `idx_presup_estado`       (`estado`),
  INDEX `idx_presup_fecha`        (`fecha_envio`),
  CONSTRAINT `fk_presup_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  4. ctcon_proveedores
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_proveedores` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT,
  `id_bc3`           VARCHAR(36)   DEFAULT NULL UNIQUE  COMMENT 'ID original de Supabase (string random)',
  `nombre_empresa`   VARCHAR(255)  NOT NULL,
  `oficio_principal` VARCHAR(100)  DEFAULT NULL,
  `email`            VARCHAR(255)  DEFAULT NULL,
  `telefono`         VARCHAR(30)   DEFAULT NULL,
  `valoracion`       DECIMAL(3,1)  DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_prov_oficio` (`oficio_principal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  5. ctcon_solicitudes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_solicitudes` (
  `id`                    BIGINT        NOT NULL AUTO_INCREMENT,
  `id_bc3`                CHAR(36)      DEFAULT NULL UNIQUE  COMMENT 'UUID original de Supabase',
  `propuesta_id`          BIGINT        NOT NULL,
  `propuesta_bc3`         VARCHAR(200)  DEFAULT NULL,
  `oficio_solicitado`     VARCHAR(100)  DEFAULT NULL,
  `fecha_envio`           DATETIME      DEFAULT NULL,
  `estado_solicitud`      VARCHAR(30)   DEFAULT 'Enviada',
  `token`                 VARCHAR(100)  DEFAULT NULL,
  `proveedor_nombre`      VARCHAR(255)  DEFAULT NULL,
  `proveedor_email`       VARCHAR(255)  DEFAULT NULL,
  `tareas`                LONGTEXT      DEFAULT NULL  COMMENT 'JSON: partidas solicitadas',
  `proveedor_id`          BIGINT        DEFAULT NULL,
  `comentarios_generales` TEXT          DEFAULT NULL,
  `anexo_url`             VARCHAR(500)  DEFAULT NULL,
  `created_at`            DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sol_propuesta` (`propuesta_id`),
  INDEX `idx_sol_proveedor` (`proveedor_id`),
  INDEX `idx_sol_estado`    (`estado_solicitud`),
  INDEX `idx_sol_token`     (`token`(50)),
  CONSTRAINT `fk_sol_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  6. ctcon_respuestas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_respuestas` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `id_bc3`          CHAR(36)      DEFAULT NULL UNIQUE  COMMENT 'UUID original de Supabase',
  `solicitud_id`    BIGINT        NOT NULL              COMMENT 'FK → ctcon_solicitudes.id',
  `solicitud_bc3`   CHAR(36)      DEFAULT NULL          COMMENT 'UUID original solicitud',
  `proveedor_id`    BIGINT        DEFAULT NULL,
  `proveedor_bc3`   VARCHAR(36)   DEFAULT NULL,
  `partida_id`      BIGINT        DEFAULT NULL          COMMENT 'FK → ctcon_partidas.id (mapeado)',
  `partida_bc3`     VARCHAR(150)  DEFAULT NULL          COMMENT 'ID BC3 original de partida',
  `precio_ofertado` DECIMAL(12,2) DEFAULT NULL,
  `comentarios`     TEXT          DEFAULT NULL,
  `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_resp_solicitud` (`solicitud_id`),
  INDEX `idx_resp_partida`   (`partida_id`),
  CONSTRAINT `fk_resp_solicitud`
    FOREIGN KEY (`solicitud_id`) REFERENCES `ctcon_solicitudes` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  7. ctcon_historial_cambios
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_historial_cambios` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `fecha_cambio`         DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `usuario`              VARCHAR(100) DEFAULT NULL,
  `origen_cambio`        VARCHAR(100) DEFAULT NULL,
  `tipo_entidad`         VARCHAR(50)  DEFAULT NULL,
  `entidad_id`           VARCHAR(200) DEFAULT NULL,
  `proyecto_referencia`  VARCHAR(200) DEFAULT NULL,
  `campo_modificado`     VARCHAR(100) DEFAULT NULL,
  `valor_anterior`       TEXT         DEFAULT NULL,
  `valor_nuevo`          TEXT         DEFAULT NULL,
  `detalles`             TEXT         DEFAULT NULL,
  `created_at`           DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_hist_proyecto` (`proyecto_referencia`(100)),
  INDEX `idx_hist_fecha`    (`fecha_cambio`),
  INDEX `idx_hist_origen`   (`origen_cambio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  8. ctcon_base_precios_adir  (54.490 filas)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_base_precios_adir` (
  `id`                    BIGINT        NOT NULL AUTO_INCREMENT,
  `codigo`                VARCHAR(100)  NOT NULL UNIQUE,
  `categoria`             VARCHAR(500)  DEFAULT NULL,
  `unidad`                VARCHAR(20)   DEFAULT NULL,
  `descripcion_corta`     VARCHAR(500)  DEFAULT NULL,
  `descripcion_detallada` LONGTEXT      DEFAULT NULL,
  `mano_de_obra`          DECIMAL(12,4) DEFAULT NULL,
  `maquinaria`            DECIMAL(12,4) DEFAULT NULL,
  `materiales_y_otros`    DECIMAL(12,4) DEFAULT NULL,
  `precio_total`          DECIMAL(12,4) DEFAULT NULL,
  `tags`                  TEXT          DEFAULT NULL,
  `tipo`                  VARCHAR(50)   DEFAULT NULL,
  `fecha`                 DATE          DEFAULT NULL,
  `tipo_partida`          VARCHAR(30)   DEFAULT NULL,
  `fuente`                VARCHAR(100)  DEFAULT NULL,
  `fecha_actualizacion`   DATE          DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_codigo`       (`codigo`),
  INDEX `idx_adir_tipo`        (`tipo_partida`),
  INDEX `idx_adir_unidad`      (`unidad`),
  FULLTEXT INDEX `ft_adir_desc`(`descripcion_corta`, `tags`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  9. ctcon_precios_cype  (3.669 filas)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_precios_cype` (
  `id`                    BIGINT        NOT NULL AUTO_INCREMENT,
  `codigo`                VARCHAR(100)  NOT NULL UNIQUE,
  `categoria`             VARCHAR(500)  DEFAULT NULL,
  `unidad`                VARCHAR(20)   DEFAULT NULL,
  `descripcion_corta`     VARCHAR(500)  DEFAULT NULL,
  `descripcion_detallada` LONGTEXT      DEFAULT NULL,
  `mano_de_obra`          DECIMAL(12,4) DEFAULT NULL,
  `maquinaria`            DECIMAL(12,4) DEFAULT NULL,
  `materiales`            DECIMAL(12,4) DEFAULT NULL,
  `precio_total`          DECIMAL(12,4) DEFAULT NULL,
  `tipo_partida`          VARCHAR(30)   DEFAULT NULL,
  `fuente`                VARCHAR(100)  DEFAULT NULL,
  `fecha_actualizacion`   DATE          DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_codigo`       (`codigo`),
  INDEX `idx_cype_tipo`        (`tipo_partida`),
  INDEX `idx_cype_unidad`      (`unidad`),
  FULLTEXT INDEX `ft_cype_desc`(`descripcion_corta`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  10. ctcon_configuracion
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_configuracion` (
  `clave`      VARCHAR(100) NOT NULL,
  `valor`      TEXT         DEFAULT NULL,
  `updated_at` DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `ctcon_configuracion` (`clave`, `valor`) VALUES ('mistral_api_key', '');


SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  Estructura de IDs:
--
--  Tabla                     PK numérica   Código original conservado en
--  ─────────────────────────────────────────────────────────────────────
--  ctcon_propuestas          id BIGINT     proyecto_bc3  VARCHAR(200)
--  ctcon_partidas            id BIGINT     id_bc3        VARCHAR(150)
--  ctcon_presupuestos_cliente id BIGINT    id_bc3        CHAR(36)
--  ctcon_proveedores         id BIGINT     id_bc3        VARCHAR(36)
--  ctcon_solicitudes         id BIGINT     id_bc3        CHAR(36)
--  ctcon_respuestas          id BIGINT     id_bc3        CHAR(36)
--  ctcon_base_precios_adir   id BIGINT     codigo        VARCHAR(100)
--  ctcon_precios_cype        id BIGINT     codigo        VARCHAR(100)
--  ctcon_historial_cambios   id BIGINT     (auto)
--  ctcon_configuracion       clave PK      (sin cambio)
--
--  Cuando el frontend migre de Supabase a MySQL:
--    .eq('Proyecto', x)  →  .eq('id', mapProyectos[x])
--    .eq('id', x)        →  .eq('id', mapPartidas[x])   (para partidas)
-- ============================================================
