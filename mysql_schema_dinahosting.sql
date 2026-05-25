-- ============================================================
--  ADIR Gestión de Obras — Esquema MySQL / MariaDB
--  Base de datos: adirg_bbdd (Dinahosting)
--  Generado: 2026-05-25
--  Codificación: utf8mb4 (soporte emojis y caracteres especiales)
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────
--  1. PROPUESTAS (proyectos)
--  PK: texto BC3 heredado (ej: "25007__REFORM__2024-03-15T...")
--  Mantener como texto por compatibilidad con datos existentes.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `propuestas` (
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
  INDEX `idx_estado`           (`estado`),
  INDEX `idx_jefe_obra`        (`jefe_obra`),
  INDEX `idx_fecha_recepcion`  (`fecha_recepcion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  2. PARTIDAS (líneas de presupuesto)
--  OPTIMIZACIÓN vs Supabase:
--    - texto_partida "cod::desc" separado en 2 columnas
--    - índices en las columnas más consultadas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `partidas` (
  `id`                      CHAR(36)       NOT NULL          COMMENT 'UUID',
  `propuesta_id`            VARCHAR(200)   NOT NULL          COMMENT 'FK → propuestas.Proyecto',
  -- OPTIMIZACIÓN: separamos lo que antes era "01.02.03::Descripción" en dos campos
  `capitulo_codigo`         VARCHAR(100)   DEFAULT NULL      COMMENT 'Código BC3 (ej: 01.02.03 o 01#)',
  `descripcion`             TEXT           DEFAULT NULL      COMMENT 'Descripción de la partida',
  -- Precios
  `precio_base_estimado`    DECIMAL(12,2)  DEFAULT 0.00      COMMENT 'Precio unitario BC3 original',
  `precio_adjudicado`       DECIMAL(12,2)  DEFAULT NULL      COMMENT 'Precio final aprobado por jefe de obra',
  -- Medición
  `cantidad`                DECIMAL(12,3)  DEFAULT 0.000,
  `unidad`                  VARCHAR(20)    DEFAULT NULL      COMMENT 'Unidad de medida (m2, ml, ud...)',
  -- Asignación
  `oficio_asignado`         VARCHAR(100)   DEFAULT NULL,
  `proveedor_adjudicado_id` VARCHAR(36)    DEFAULT NULL      COMMENT 'FK → proveedores.id',
  `estado_adjudicacion`     VARCHAR(30)    DEFAULT NULL      COMMENT 'Adjudicado | null',
  `created_at`              DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_propuesta_id`   (`propuesta_id`),
  INDEX `idx_capitulo`       (`capitulo_codigo`),
  INDEX `idx_oficio`         (`oficio_asignado`),
  CONSTRAINT `fk_partidas_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  3. PRESUPUESTOS_CLIENTE (presupuestos enviados para firma)
--  OPTIMIZACIÓN:
--    - partidas: LONGTEXT JSON (solo campos necesarios, ~70% menos peso)
--    - firma: se guarda URL en vez de base64 (campo separado)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `presupuestos_cliente` (
  `id`                   CHAR(36)      NOT NULL,
  `token`                CHAR(36)      NOT NULL UNIQUE        COMMENT 'Token público para el portal',
  `propuesta_id`         VARCHAR(200)  NOT NULL               COMMENT 'FK → propuestas.Proyecto',
  `cliente_nombre`       VARCHAR(255)  DEFAULT NULL,
  `cliente_email`        VARCHAR(255)  DEFAULT NULL,
  `proyecto_descripcion` VARCHAR(500)  DEFAULT NULL,
  -- JSON simplificado: solo {Capítulo, Descripción, Cantidad, Unidad IA, precio_adjudicado, precio_total_capitulo}
  `partidas`             LONGTEXT      DEFAULT NULL           COMMENT 'Snapshot JSON de partidas (campos mínimos)',
  `precio_total`         DECIMAL(12,2) DEFAULT 0.00,
  `fecha_envio`          DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `estado`               VARCHAR(30)   NOT NULL DEFAULT 'pendiente'
                         COMMENT 'pendiente | firmado | rechazado | firmado_archivado | rechazado_archivado',
  -- FIRMA: URL de fichero en vez de base64 en BD
  `firma_url`            VARCHAR(500)  DEFAULT NULL           COMMENT 'URL del fichero de firma (storage)',
  `firma_base64`         LONGTEXT      DEFAULT NULL           COMMENT 'Backup base64 (deprecado, usar firma_url)',
  `fecha_firma`          DATETIME      DEFAULT NULL,
  `detalles_rechazo`     TEXT          DEFAULT NULL,
  `created_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_token` (`token`),
  INDEX `idx_propuesta_id` (`propuesta_id`),
  INDEX `idx_estado`       (`estado`),
  INDEX `idx_fecha_envio`  (`fecha_envio`),
  CONSTRAINT `fk_presupuesto_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  4. PROVEEDORES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `proveedores` (
  `id`               VARCHAR(36)   NOT NULL                  COMMENT 'UUID o string random heredado',
  `nombre_empresa`   VARCHAR(255)  NOT NULL,
  `oficio_principal` VARCHAR(100)  DEFAULT NULL,
  `email`            VARCHAR(255)  DEFAULT NULL,
  `telefono`         VARCHAR(30)   DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_oficio` (`oficio_principal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  5. SOLICITUDES (peticiones de precio a proveedores)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `solicitudes` (
  `id`                CHAR(36)      NOT NULL,
  `propuesta_id`      VARCHAR(200)  NOT NULL,
  `proveedor_id`      VARCHAR(36)   DEFAULT NULL,
  `proveedor_nombre`  VARCHAR(255)  DEFAULT NULL,
  `proveedor_email`   VARCHAR(255)  DEFAULT NULL,
  `estado_solicitud`  VARCHAR(30)   DEFAULT 'Enviada'
                      COMMENT 'Enviada | Respondida | Adjudicada | Rechazada',
  `created_at`        DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_propuesta_id`  (`propuesta_id`),
  INDEX `idx_proveedor_id`  (`proveedor_id`),
  INDEX `idx_estado`        (`estado_solicitud`),
  CONSTRAINT `fk_solicitud_propuesta`
    FOREIGN KEY (`propuesta_id`) REFERENCES `propuestas` (`Proyecto`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  6. RESPUESTAS (ofertas de proveedores)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `respuestas` (
  `id`              CHAR(36)      NOT NULL,
  `solicitud_id`    CHAR(36)      NOT NULL               COMMENT 'FK → solicitudes.id',
  `partida_id`      CHAR(36)      NOT NULL               COMMENT 'FK → partidas.id',
  `precio_ofertado` DECIMAL(12,2) DEFAULT NULL,
  `comentarios`     TEXT          DEFAULT NULL,
  `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_solicitud_id` (`solicitud_id`),
  INDEX `idx_partida_id`   (`partida_id`),
  CONSTRAINT `fk_respuesta_solicitud`
    FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  7. HISTORIAL_CAMBIOS (log de auditoría)
--  Añadir índices para filtrados rápidos por proyecto y fecha.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `historial_cambios` (
  `id`                   BIGINT        NOT NULL AUTO_INCREMENT,
  `origen_cambio`        VARCHAR(100)  DEFAULT NULL   COMMENT 'Manual (Jefe Obra) | IA | Sistema',
  `tipo_entidad`         VARCHAR(50)   DEFAULT NULL   COMMENT 'Partida | Propuesta | Presupuesto',
  `entidad_id`           VARCHAR(200)  DEFAULT NULL,
  `proyecto_referencia`  VARCHAR(200)  DEFAULT NULL,
  `campo_modificado`     VARCHAR(100)  DEFAULT NULL,
  `valor_anterior`       TEXT          DEFAULT NULL,
  `valor_nuevo`          TEXT          DEFAULT NULL,
  `detalles`             TEXT          DEFAULT NULL,
  `created_at`           DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_proyecto`   (`proyecto_referencia`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_origen`     (`origen_cambio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  8. BASE_PRECIOS (catálogo de precios BC3)
--  OPTIMIZACIÓN: FULLTEXT index para búsqueda por descripción
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `base_precios` (
  `id`                CHAR(36)      NOT NULL,
  `codigo`            VARCHAR(100)  DEFAULT NULL,
  `descripcion_corta` VARCHAR(500)  DEFAULT NULL,
  `descripcion_larga` LONGTEXT      DEFAULT NULL,
  `tags`              TEXT          DEFAULT NULL,
  `unidad`            VARCHAR(20)   DEFAULT NULL,
  `tipo_partida`      VARCHAR(30)   DEFAULT NULL  COMMENT 'trabajo | material | capitulo | desconocido',
  `precio_total`      DECIMAL(12,4) DEFAULT NULL,
  `mano_de_obra`      DECIMAL(12,4) DEFAULT NULL,
  `ratio_mo`          DECIMAL(5,4)  DEFAULT NULL,
  `origen`            VARCHAR(100)  DEFAULT NULL  COMMENT 'BC3 | Manual | PDF',
  `created_at`        DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_codigo`       (`codigo`),
  INDEX `idx_tipo`         (`tipo_partida`),
  INDEX `idx_unidad`       (`unidad`),
  -- FULLTEXT para búsqueda eficiente de descripciones similares
  FULLTEXT INDEX `ft_descripcion` (`descripcion_corta`, `tags`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
--  9. CONFIGURACION (key-value de ajustes de la app)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `configuracion` (
  `clave`      VARCHAR(100)  NOT NULL,
  `valor`      TEXT          DEFAULT NULL,
  `updated_at` DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valor inicial: API key de Mistral (vacío, se rellena desde Ajustes)
INSERT IGNORE INTO `configuracion` (`clave`, `valor`) VALUES ('mistral_api_key', '');


SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  FIN DEL ESQUEMA
--  Para importar: phpMyAdmin → adirg_bbdd → Importar → este fichero
-- ============================================================
