-- Migración: añadir cliente_id a presupuestos_cliente
-- Ejecutar en phpMyAdmin de Dinahosting (base de datos: adirg_bbdd)
-- ---------------------------------------------------------------

ALTER TABLE ctcon_presupuestos_cliente
    ADD COLUMN cliente_id INT NULL DEFAULT NULL
    AFTER propuesta_bc3;

-- Índice opcional para acelerar búsquedas por cliente
CREATE INDEX idx_presupuestos_cliente_id ON ctcon_presupuestos_cliente (cliente_id);
