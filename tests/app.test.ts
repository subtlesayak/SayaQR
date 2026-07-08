import test from 'node:test';
import assert from 'node:assert/strict';
import {formatUrl, formatWifi, formatVCard, formatUpi} from '../src/formatters.ts';
import {QrCode} from '../src/qrcodegen.ts';
import {toSvg, warnings, defaults} from '../src/render.ts';

test('URL QR formatting adds https scheme',()=>{ assert.equal(formatUrl('example.com/path'),'https://example.com/path'); assert.equal(formatUrl('https://example.com'),'https://example.com'); });
test('Wi-Fi QR escaping escapes reserved characters',()=>{ assert.equal(formatWifi({ssid:'Cafe;Net',password:'p,a:ss"word',security:'WPA',hidden:false}),'WIFI:T:WPA;S:Cafe\\;Net;P:p\\,a\\:ss\\"word;H:false;;'); });
test('vCard formatting emits vCard 3 fields',()=>{ const card=formatVCard({name:'Ada Lovelace',org:'Analytical',phone:'+123',email:'ada@example.com'}); assert.match(card,/BEGIN:VCARD/); assert.match(card,/VERSION:3.0/); assert.match(card,/FN:Ada Lovelace/); assert.match(card,/EMAIL:ada@example.com/); });
test('UPI formatting builds pay URI',()=>{ const uri=formatUpi({pa:'ada@upi',pn:'Ada',am:'10',cu:'INR',tn:'Thanks'}); assert.equal(uri,'upi://pay?pa=ada%40upi&pn=Ada&am=10&cu=INR&tn=Thanks'); });
test('SVG export contains SVG and module rectangles',()=>{ const svg=toSvg(QrCode.encodeText('hello'),defaults); assert.match(svg,/^<svg/); assert.match(svg,/<rect/); });
test('Contrast warning detects low contrast',()=>{ assert.ok(warnings('x',{...defaults,fg:'#777777',bg:'#777777',transparent:false}).some(w=>/Contrast/.test(w))); });
test('Quiet zone warning detects small margins',()=>{ assert.ok(warnings('x',{...defaults,margin:1}).some(w=>/Quiet zone/.test(w))); });
