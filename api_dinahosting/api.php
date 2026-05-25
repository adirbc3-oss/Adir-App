<?php
/**
 * ADIR API — PHP REST wrapper para MySQL en Dinahosting
 * ======================================================
 * Reemplaza al cliente Supabase en la app React.
 * Subir este fichero a Dinahosting en: /public_html/api/api.php
 *
 * SEGURIDAD: cambiar API_KEY por una clave aleatoria larga.
 * El frontend la envía en la cabecera: X-Api-Key: TU_CLAVE
 */

define('API_KEY',  'CAMBIA_ESTA_CLAVE_POR_UNA_SEGURA_40_CHARS');
define('DB_HOST',  'localhost');       // Normalmente localhost en Dinahosting
define('DB_USER',  'TU_USUARIO_DB');
define('DB_PASS',  'TU_PASSWORD_DB');
define('DB_NAME',  'adirg_bbdd');

// ─── Headers CORS (permite llamadas desde Vercel) ─────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://adir-app.vercel.app');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Key, Prefer');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ─── Autenticación ───────────────────────────────────────────────────────────
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($apiKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// ─── Conexión MySQL ───────────────────────────────────────────────────────────
$pdo = new PDO(
    "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
    DB_USER, DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

// ─── Router ──────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$path   = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
$parts  = explode('/', $path);

// Esperamos: api/TABLA o api/TABLA/ID
$table  = $parts[1] ?? '';   // ej: "propuestas"
$id     = $parts[2] ?? null; // ej: "123" (opcional)

$query  = $_GET;             // parámetros ?campo=eq.valor&select=...
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

// Tablas permitidas (whitelist)
$allowed = ['propuestas','partidas','presupuestos_cliente','proveedores',
            'solicitudes','respuestas','historial_cambios','base_precios','configuracion'];

if (!in_array($table, $allowed)) {
    http_response_code(404);
    echo json_encode(['error' => "Tabla '$table' no encontrada"]);
    exit;
}

// ─── SELECT ──────────────────────────────────────────────────────────────────
function buildWhere(array $params, PDO $pdo): array {
    $conditions = [];
    $binds = [];
    $allowedOps = ['eq' => '=', 'neq' => '!=', 'gt' => '>', 'gte' => '>=',
                   'lt' => '<', 'lte' => '<=', 'like' => 'LIKE', 'in' => 'IN'];

    foreach ($params as $key => $val) {
        if (in_array($key, ['select','limit','offset','order'])) continue;
        // Formato Supabase: campo=op.valor
        if (strpos($val, '.') !== false) {
            [$op, $v] = explode('.', $val, 2);
            $sqlOp = $allowedOps[$op] ?? '=';
            if ($op === 'in') {
                // in.(val1,val2) → IN (?,?)
                $vals = explode(',', trim($v, '()'));
                $placeholders = implode(',', array_fill(0, count($vals), '?'));
                $conditions[] = "`$key` IN ($placeholders)";
                foreach ($vals as $iv) $binds[] = trim($iv, '"');
            } else {
                $conditions[] = "`$key` $sqlOp ?";
                $binds[] = $v;
            }
        } else {
            $conditions[] = "`$key` = ?";
            $binds[] = $val;
        }
    }
    return ['sql' => $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '', 'binds' => $binds];
}

try {
    switch ($method) {
        case 'GET': {
            $select = isset($query['select']) ? $query['select'] : '*';
            // Seguridad: solo columnas simples (sin subqueries)
            $cols = preg_replace('/[^a-zA-Z0-9_,\s\*]/', '', $select);

            [$where, $binds] = array_values(buildWhere($query, $pdo));
            $limit  = isset($query['limit'])  ? (int)$query['limit']  : 1000;
            $offset = isset($query['offset']) ? (int)$query['offset'] : 0;
            $order  = '';
            if (isset($query['order'])) {
                $ord = explode('.', $query['order']);
                $col = preg_replace('/[^a-zA-Z0-9_]/', '', $ord[0]);
                $dir = (isset($ord[1]) && strtolower($ord[1]) === 'desc') ? 'DESC' : 'ASC';
                $order = "ORDER BY `$col` $dir";
            }

            $sql = "SELECT $cols FROM `$table` $where $order LIMIT $limit OFFSET $offset";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($binds);
            $rows = $stmt->fetchAll();

            // Decodificar JSON para campo partidas
            foreach ($rows as &$row) {
                if (isset($row['partidas']) && is_string($row['partidas'])) {
                    $row['partidas'] = json_decode($row['partidas'], true);
                }
            }

            echo json_encode($rows);
            break;
        }

        case 'POST': {
            // Codificar partidas como JSON si es array
            if (isset($body['partidas']) && is_array($body['partidas'])) {
                $body['partidas'] = json_encode($body['partidas'], JSON_UNESCAPED_UNICODE);
            }
            $cols  = implode(', ', array_map(fn($c) => "`$c`", array_keys($body)));
            $phs   = implode(', ', array_fill(0, count($body), '?'));
            $stmt  = $pdo->prepare("INSERT INTO `$table` ($cols) VALUES ($phs)");
            $stmt->execute(array_values($body));
            $newId = $pdo->lastInsertId();
            http_response_code(201);
            echo json_encode(['id' => $newId]);
            break;
        }

        case 'PATCH': {
            if (isset($body['partidas']) && is_array($body['partidas'])) {
                $body['partidas'] = json_encode($body['partidas'], JSON_UNESCAPED_UNICODE);
            }
            [$where, $wBinds] = array_values(buildWhere($query, $pdo));
            $sets  = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($body)));
            $binds = array_merge(array_values($body), $wBinds);
            $stmt  = $pdo->prepare("UPDATE `$table` SET $sets $where");
            $stmt->execute($binds);
            echo json_encode(['updated' => $stmt->rowCount()]);
            break;
        }

        case 'DELETE': {
            [$where, $binds] = array_values(buildWhere($query, $pdo));
            if (!$where) { http_response_code(400); echo json_encode(['error' => 'DELETE sin WHERE no permitido']); break; }
            $stmt = $pdo->prepare("DELETE FROM `$table` $where");
            $stmt->execute($binds);
            echo json_encode(['deleted' => $stmt->rowCount()]);
            break;
        }

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Método no permitido']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
