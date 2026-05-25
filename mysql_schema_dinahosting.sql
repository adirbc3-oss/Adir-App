-- ============================================================
--  ADIR Gestión de Obras — Esquema MySQL / MariaDB
--  Base de datos: adirg_bbdd (Dinahosting)
--  Prefijo de tablas: ctcon_
--  Generado: 2026-05-25 — auditado contra Supabase real
-- ============================================================
--
--  TABLAS (10):
--   ctcon_propuestas           — proyectos
--   ctcon_partidas             — líneas de presupuesto
--   ctcon_presupuestos_cliente — presupuestos enviados para firma
--   ctcon_proveedores          — catálogo de proveedores
--   ctcon_solicitudes          — solicitudes de precio a proveedores
--   ctcon_respuestas           — respuestas / ofertas de proveedores
--   ctcon_historial_cambios    — log de auditoría
--   ctcon_base_precios_adir    — catálogo precios ADIR (54.490 filas)
--   ctcon_precios_cype         — catálogo precios CYPE Murcia (3.669 filas)
--   ctcon_configuracion        — ajustes de la aplicación
--
--  IMPORTAR EN ESTE ORDEN:
--   1. Este fichero (estructura)
--   2. migracion_adir_datos_*.sql (datos)
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────
--  Borrar tablas antiguas si existen (para reimportación limpia)
-- ─────────────────────────────────────────────────────────────
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
--  Columnas reales Supabase:
--    Proyecto, cliente, direccion, fecha_recepcion, estado,
--    jefe_obra, descripcion
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_propuestas` (
  `Proyecto`         VARCHAR(200) NOT NULL          COMMENT 'ID único BC3 (ej: 25007__REFORM__2024-03-15T...)',
  `cliente`          VARCHAR(255) DEFAULT NULL       COMMENT 'Nombre del cliente',
  `direccion`        VARCHAR(255) DEFAULT NULL       COMMENT 'Email de contacto del cliente',
  `jefe_obra`        VARCHAR(100) DEFAULT NULL,
  `estado`           VARCHAR(30)  NOT NULL DEFAULT 'Borrador'
                     COMMENT 'Pendiente | Borrador | En Revisión | En Curso | Finalizado',
  `fecha_recepcion`  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `descripcion`      TEXT         DEFAULT NULL       COMMENT 'Nombre legible del proyecto (editable)',
  `created_at`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`Proyecto`),
  INDEX `idx_prop_estado`   (`estado`),
  INDEX `idx_prop_jefe`     (`jefe_obra`),
  INDEX `idx_prop_fecha`    (`fecha_recepcion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  2. ctcon_partidas
--  Columnas reales Supabase:
--    id, propuesta_id, texto_partida, oficio_asignado, cantidad,
--    precio_base_estimado, proveedor_adjudicado_id, precio_adjudicado,
--    estado_adjudicacion, precio_ia, unidad, force_quote
--
--  OPTIMIZACIÓN: texto_partida "COD::Desc" separado en 2 columnas.
--  Se mantiene texto_partida como backup temporal.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_partidas` (
  `id`                      CHAR(36)       NOT NULL,
  `propuesta_id`            VARCHAR(200)   NOT NULL,
  -- texto_partida original (backup de migración)
  `texto_partida`           TEXT           DEFAULT NULL COMMENT 'Formato original: COD::Descripción',
  -- Columnas separadas (optimizadas)
  `capitulo_codigo`         VARCHAR(100)   DEFAULT NULL COMMENT 'Código BC3 extraído de texto_partida',
  `descripcion`             TEXT           DEFAULT NULL COMMENT 'Descripción extraída de texto_partida',
  -- Precios
  `precio_base_estimado`    DECIMAL(12,2)  DEFAULT 0.00,
  `precio_adjudicado`       DECIMAL(12,2)  DEFAULT NULL,
  `precio_ia`               DECIMAL(12,2)  DEFAULT NULL COMMENT 'Precio estimado por IA',
  -- Medición
  `cantidad`                DECIMAL(12,3)  DEFAULT 0.000,
  `unidad`                  VARCHAR(20)    DEFAULT NULL,
  -- Asignación
  `oficio_asignado`         VARCHAR(100)   DEFAULT NULL,
  `proveedor_adjudicado_id` VARCHAR(36)    DEFAULT NULL,
  `estado_adjudicacion`     VARCHAR(30)    DEFAULT NULL,
  `force_quote`             TINYINT(1)     DEFAULT 0   COMMENT 'Forzar solicitud de precio',
  `created_at`              DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_part_propuesta`  (`propuesta_id`),
  INDEX `idx_part_capitulo`   (`capitulo_codigo`),
  INDEX `idx_part_oficio`     (`oficio_asignado`),
  CONSTRAINT `fk_part_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  3. ctcon_presupuestos_cliente
--  Columnas reales Supabase:
--    id, token, propuesta_id, cliente_nombre, cliente_email,
--    proyecto_descripcion, partidas, precio_total, fecha_envio,
--    estado, firma_base64, fecha_firma, detalles_rechazo
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_presupuestos_cliente` (
  `id`                   CHAR(36)      NOT NULL,
  `token`                CHAR(36)      NOT NULL,
  `propuesta_id`         VARCHAR(200)  NOT NULL,
  `cliente_nombre`       VARCHAR(255)  DEFAULT NULL,
  `cliente_email`        VARCHAR(255)  DEFAULT NULL,
  `proyecto_descripcion` VARCHAR(500)  DEFAULT NULL,
  `partidas`             LONGTEXT      DEFAULT NULL   COMMENT 'JSON snapshot de partidas (saneado)',
  `precio_total`         DECIMAL(12,2) DEFAULT 0.00,
  `fecha_envio`          DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `estado`               VARCHAR(30)   NOT NULL DEFAULT 'pendiente'
                         COMMENT 'pendiente | firmado | rechazado | firmado_archivado | rechazado_archivado',
  `firma_base64`         LONGTEXT      DEFAULT NULL   COMMENT 'Imagen de firma en base64',
  `firma_url`            VARCHAR(500)  DEFAULT NULL   COMMENT 'URL de fichero de firma (futuro)',
  `fecha_firma`          DATETIME      DEFAULT NULL,
  `detalles_rechazo`     TEXT          DEFAULT NULL,
  `created_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_token` (`token`),
  INDEX `idx_presup_propuesta`  (`propuesta_id`),
  INDEX `idx_presup_estado`     (`estado`),
  INDEX `idx_presup_fecha`      (`fecha_envio`),
  CONSTRAINT `fk_presup_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  4. ctcon_proveedores
--  Columnas reales Supabase:
--    id, nombre_empresa, oficio_principal, email, telefono, valoracion
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_proveedores` (
  `id`               VARCHAR(36)    NOT NULL,
  `nombre_empresa`   VARCHAR(255)   NOT NULL,
  `oficio_principal` VARCHAR(100)   DEFAULT NULL,
  `email`            VARCHAR(255)   DEFAULT NULL,
  `telefono`         VARCHAR(30)    DEFAULT NULL,
  `valoracion`       DECIMAL(3,1)   DEFAULT NULL  COMMENT 'Puntuación 0-5',
  `created_at`       DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_prov_oficio` (`oficio_principal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  5. ctcon_solicitudes
--  Columnas reales Supabase:
--    id, propuesta_id, oficio_solicitado, fecha_envio,
--    estado_solicitud, token, proveedor_nombre, proveedor_email,
--    tareas, proveedor_id, comentarios_generales, anexo_url
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_solicitudes` (
  `id`                   CHAR(36)      NOT NULL,
  `propuesta_id`         VARCHAR(200)  NOT NULL,
  `oficio_solicitado`    VARCHAR(100)  DEFAULT NULL,
  `fecha_envio`          DATETIME      DEFAULT NULL,
  `estado_solicitud`     VARCHAR(30)   DEFAULT 'Enviada'
                         COMMENT 'Enviada | Respondida | Adjudicada | Rechazada',
  `token`                VARCHAR(100)  DEFAULT NULL   COMMENT 'Token único para el portal del proveedor',
  `proveedor_nombre`     VARCHAR(255)  DEFAULT NULL,
  `proveedor_email`      VARCHAR(255)  DEFAULT NULL,
  `tareas`               LONGTEXT      DEFAULT NULL   COMMENT 'JSON: lista de partidas solicitadas',
  `proveedor_id`         VARCHAR(36)   DEFAULT NULL,
  `comentarios_generales` TEXT         DEFAULT NULL,
  `anexo_url`            VARCHAR(500)  DEFAULT NULL   COMMENT 'URL del fichero anexo',
  `created_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sol_propuesta`  (`propuesta_id`),
  INDEX `idx_sol_proveedor`  (`proveedor_id`),
  INDEX `idx_sol_estado`     (`estado_solicitud`),
  INDEX `idx_sol_token`      (`token`),
  CONSTRAINT `fk_sol_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `ctcon_propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  6. ctcon_respuestas
--  Columnas reales Supabase:
--    id, solicitud_id, proveedor_id, partida_id,
--    precio_ofertado, comentarios, created_at
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_respuestas` (
  `id`              CHAR(36)      NOT NULL,
  `solicitud_id`    CHAR(36)      NOT NULL,
  `proveedor_id`    VARCHAR(36)   DEFAULT NULL,
  `partida_id`      CHAR(36)      NOT NULL,
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
--  Columnas reales Supabase:
--    id, fecha_cambio, usuario, origen_cambio, tipo_entidad,
--    entidad_id, proyecto_referencia, campo_modificado,
--    valor_anterior, valor_nuevo, detalles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_historial_cambios` (
  `id`                   BIGINT        NOT NULL AUTO_INCREMENT,
  `fecha_cambio`         DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `usuario`              VARCHAR(100)  DEFAULT NULL,
  `origen_cambio`        VARCHAR(100)  DEFAULT NULL  COMMENT 'Manual (Jefe Obra) | IA | Sistema',
  `tipo_entidad`         VARCHAR(50)   DEFAULT NULL,
  `entidad_id`           VARCHAR(200)  DEFAULT NULL,
  `proyecto_referencia`  VARCHAR(200)  DEFAULT NULL,
  `campo_modificado`     VARCHAR(100)  DEFAULT NULL,
  `valor_anterior`       TEXT          DEFAULT NULL,
  `valor_nuevo`          TEXT          DEFAULT NULL,
  `detalles`             TEXT          DEFAULT NULL,
  `created_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_hist_proyecto`  (`proyecto_referencia`),
  INDEX `idx_hist_fecha`     (`fecha_cambio`),
  INDEX `idx_hist_origen`    (`origen_cambio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  8. ctcon_base_precios_adir  (54.490 filas)
--  Columnas reales Supabase:
--    codigo, categoria, unidad, descripcion_corta,
--    descripcion_detallada, mano_de_obra, maquinaria,
--    materiales_y_otros, precio_total, tags, tipo, fecha,
--    tipo_partida, fuente, fecha_actualizacion
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_base_precios_adir` (
  `codigo`               VARCHAR(100)   NOT NULL,
  `categoria`            VARCHAR(500)   DEFAULT NULL,
  `unidad`               VARCHAR(20)    DEFAULT NULL,
  `descripcion_corta`    VARCHAR(500)   DEFAULT NULL,
  `descripcion_detallada` LONGTEXT      DEFAULT NULL,
  `mano_de_obra`         DECIMAL(12,4)  DEFAULT NULL,
  `maquinaria`           DECIMAL(12,4)  DEFAULT NULL,
  `materiales_y_otros`   DECIMAL(12,4)  DEFAULT NULL,
  `precio_total`         DECIMAL(12,4)  DEFAULT NULL,
  `tags`                 TEXT           DEFAULT NULL,
  `tipo`                 VARCHAR(50)    DEFAULT NULL,
  `fecha`                DATE           DEFAULT NULL,
  `tipo_partida`         VARCHAR(30)    DEFAULT NULL  COMMENT 'trabajo | material | mano_de_obra | ...',
  `fuente`               VARCHAR(100)   DEFAULT NULL,
  `fecha_actualizacion`  DATE           DEFAULT NULL,
  PRIMARY KEY (`codigo`),
  INDEX `idx_adir_tipo`       (`tipo_partida`),
  INDEX `idx_adir_unidad`     (`unidad`),
  -- FULLTEXT para búsquedas de similaridad
  FULLTEXT INDEX `ft_adir_desc` (`descripcion_corta`, `tags`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  9. ctcon_precios_cype  (3.669 filas) — antes: PreciosCype
--  Columnas reales Supabase:
--    codigo, categoria, unidad, descripcion_corta,
--    descripcion_detallada, mano_de_obra, maquinaria,
--    materiales, precio_total, tipo_partida, fuente,
--    fecha_actualizacion
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_precios_cype` (
  `codigo`               VARCHAR(100)   NOT NULL,
  `categoria`            VARCHAR(500)   DEFAULT NULL,
  `unidad`               VARCHAR(20)    DEFAULT NULL,
  `descripcion_corta`    VARCHAR(500)   DEFAULT NULL,
  `descripcion_detallada` LONGTEXT      DEFAULT NULL,
  `mano_de_obra`         DECIMAL(12,4)  DEFAULT NULL,
  `maquinaria`           DECIMAL(12,4)  DEFAULT NULL,
  `materiales`           DECIMAL(12,4)  DEFAULT NULL   COMMENT 'Nota: en ADIR se llama materiales_y_otros',
  `precio_total`         DECIMAL(12,4)  DEFAULT NULL,
  `tipo_partida`         VARCHAR(30)    DEFAULT NULL,
  `fuente`               VARCHAR(100)   DEFAULT NULL   COMMENT 'CYPE Murcia 2024',
  `fecha_actualizacion`  DATE           DEFAULT NULL,
  PRIMARY KEY (`codigo`),
  INDEX `idx_cype_tipo`   (`tipo_partida`),
  INDEX `idx_cype_unidad` (`unidad`),
  FULLTEXT INDEX `ft_cype_desc` (`descripcion_corta`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  10. ctcon_configuracion
-- ─────────────────────────────────────────────────────────────
CREATE TABLE `ctcon_configuracion` (
  `clave`      VARCHAR(100)  NOT NULL,
  `valor`      TEXT          DEFAULT NULL,
  `updated_at` DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `ctcon_configuracion` (`clave`, `valor`) VALUES ('mistral_api_key', '');


SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  FIN DEL ESQUEMA
--  Siguiente paso: importar migracion_adir_datos_*.sql
-- ============================================================
