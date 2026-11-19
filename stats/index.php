<?php
// Заявки по блогерам. Папку /stats нужно закрыть паролем в Plesk:
// «Сайты и домены» → friendscommunity.kz → «Защищённые паролем каталоги» → /stats.
// Без этой защиты страница данные не показывает.
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');
$authed = !empty($_SERVER['REMOTE_USER']) || !empty($_SERVER['PHP_AUTH_USER']) || !empty($_SERVER['REDIRECT_REMOTE_USER']) || !empty($_SERVER['AUTH_TYPE']);
$dir = dirname(__DIR__, 2) . '/private';
if (!is_dir($dir)) { $dir = dirname(__DIR__) . '/.leads'; }
function rows($f) {
  if (!is_file($f)) return [];
  $out = []; $fh = fopen($f, 'r');
  while (($r = fgetcsv($fh, 0, ';')) !== false) { $out[] = $r; }
  fclose($fh);
  if ($out && isset($out[0][0])) $out[0][0] = preg_replace('/^\xEF\xBB\xBF/', '', $out[0][0]);
  return $out;
}
$h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
if (!$authed) { http_response_code(403); echo '<!doctype html><meta charset="utf-8"><title>Заявки</title><body style="font-family:system-ui;padding:40px;background:#14110E;color:#F4EEE3"><h1>Страница закрыта</h1><p>Включите пароль на папку <b>/stats</b> в Plesk: «Защищённые паролем каталоги». После этого здесь появятся заявки.</p>'; exit; }
$leads = rows($dir . '/friends-leads.csv'); if ($leads && $leads[0][0] === 'Дата') array_shift($leads);
$wa = rows($dir . '/friends-wa-clicks.csv');
if (isset($_GET['csv'])) {
  header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="friends-leads.csv"');
  readfile($dir . '/friends-leads.csv'); exit;
}
$period = (int)($_GET['days'] ?? 0);
$since = $period ? time() - $period * 86400 : 0;
$in = fn($r) => !$since || strtotime($r[0]) >= $since;
$leads = array_values(array_filter($leads, $in)); $wa = array_values(array_filter($wa, $in));
$by = [];
foreach ($leads as $r) { $s = $r[4] ?: 'site'; $by[$s]['forms'] = ($by[$s]['forms'] ?? 0) + 1; }
foreach ($wa as $r) { $s = $r[1] ?: 'site'; $by[$s]['wa'] = ($by[$s]['wa'] ?? 0) + 1; }
uasort($by, fn($a, $b) => (($b['forms'] ?? 0) + ($b['wa'] ?? 0)) <=> (($a['forms'] ?? 0) + ($a['wa'] ?? 0)));
?><!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Заявки Friends</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#14110E;color:#F4EEE3}main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{margin:0 0 6px}a{color:#D9BD7B}.muted{color:#9a9388}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}.card{background:#1d1916;border:1px solid rgba(201,162,75,.28);border-radius:14px;padding:14px}.card b{display:block;font-size:26px;margin-top:4px}table{width:100%;border-collapse:collapse;margin:10px 0 28px;font-size:14px}th,td{padding:9px 8px;border-bottom:1px solid rgba(201,162,75,.18);text-align:left}th{color:#9a9388;font-weight:500}td.n,th.n{text-align:right}.wrap{overflow-x:auto}nav a{margin-right:12px}</style></head><body><main>
<h1>Заявки Friends</h1><p class="muted">Форма «Оплатить в Kaspi» и кнопка WhatsApp на friendscommunity.kz. Источник — код блогера из ссылки.</p>
<nav><a href="?">Всё время</a><a href="?days=30">30 дней</a><a href="?days=7">7 дней</a><a href="?csv=1">Скачать для Excel</a></nav>
<div class="cards"><div class="card">Заявок с формы<b><?= count($leads) ?></b></div><div class="card">Нажали WhatsApp<b><?= count($wa) ?></b></div><div class="card">Источников<b><?= count($by) ?></b></div></div>
<h2>По блогерам</h2><div class="wrap"><table><tr><th>Источник</th><th class="n">Заявки с формы</th><th class="n">Нажали WhatsApp</th></tr>
<?php foreach ($by as $s => $v): ?><tr><td><?= $h($s === 'site' ? 'Сайт (без блогера)' : $s) ?></td><td class="n"><?= (int)($v['forms'] ?? 0) ?></td><td class="n"><?= (int)($v['wa'] ?? 0) ?></td></tr><?php endforeach; ?>
<?php if (!$by): ?><tr><td colspan="3" class="muted">Пока заявок нет</td></tr><?php endif; ?></table></div>
<h2>Последние заявки</h2><div class="wrap"><table><tr><th>Дата</th><th>Имя</th><th>WhatsApp</th><th>Бизнес</th><th>Источник</th><th>Метка</th></tr>
<?php foreach (array_slice(array_reverse($leads), 0, 300) as $r): $ph = preg_replace('/\D/', '', $r[2] ?? ''); ?><tr><td><?= $h(date('d.m.Y H:i', strtotime($r[0]))) ?></td><td><?= $h($r[1] ?? '') ?></td><td><a href="https://wa.me/<?= $h($ph) ?>" target="_blank" rel="noopener"><?= $h($r[2] ?? '') ?></a></td><td><?= $h($r[3] ?? '') ?></td><td><?= $h($r[4] ?? '') ?></td><td><?= $h($r[6] ?? '') ?></td></tr><?php endforeach; ?>
</table></div></main></body></html>
