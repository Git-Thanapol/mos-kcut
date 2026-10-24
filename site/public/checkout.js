    function updateSummary() {
        // ดึงค่า แพ็กเกจ ที่เลือก
        const packageInput = document.querySelector('input[name="package"]:checked');
        const price = parseInt(packageInput.value).toLocaleString();
        const packageName = packageInput.getAttribute('data-name');
        
        // ดึงค่า วิธีชำระเงิน ที่เลือก
        const paymentInput = document.querySelector('input[name="payment"]:checked');
        const paymentMethod = paymentInput.value;

        // อัปเดต UI แพ็กเกจ
        document.querySelectorAll('.package-option').forEach(el => {
            const input = el.querySelector('input');
            const circle = el.querySelector('.radio-circle');
            const dot = el.querySelector('.radio-dot');
            const indicator = el.querySelector('.select-text-indicator');
            
            if(input.checked) {
                el.classList.add('border-amber-500', 'bg-amber-50/50');
                el.classList.remove('border-gray-200');
                circle.classList.add('border-amber-500');
                circle.classList.remove('border-gray-300');
                dot.classList.add('bg-amber-500');
                dot.classList.remove('bg-transparent');
                indicator.classList.remove('hidden');
            } else {
                el.classList.remove('border-amber-500', 'bg-amber-50/50');
                el.classList.add('border-gray-200');
                circle.classList.remove('border-amber-500');
                circle.classList.add('border-gray-300');
                dot.classList.remove('bg-amber-500');
                dot.classList.add('bg-transparent');
                indicator.classList.add('hidden');
            }
        });

        // อัปเดต UI ชำระเงิน และซ่อน/แสดงกล่องธนาคาร
        const bankDetails = document.getElementById('bankDetails');
        const slipInput = document.getElementById('slipInput');
        
        document.querySelectorAll('.payment-option').forEach(el => {
            const input = el.querySelector('input');
            const circle = el.querySelector('.radio-circle');
            const dot = el.querySelector('.radio-dot');
            
            if(input.checked) {
                el.classList.add('border-amber-500', 'bg-amber-50/50');
                el.classList.remove('border-gray-200');
                circle.classList.add('border-amber-500');
                circle.classList.remove('border-gray-300');
                dot.classList.add('bg-amber-500');
                dot.classList.remove('bg-transparent');
            } else {
                el.classList.remove('border-amber-500', 'bg-amber-50/50');
                el.classList.add('border-gray-200');
                circle.classList.remove('border-amber-500');
                circle.classList.add('border-gray-300');
                dot.classList.remove('bg-amber-500');
                dot.classList.add('bg-transparent');
            }
        });

        // อัปเดตข้อความในกล่องสรุปและปุ่ม
        document.getElementById('summaryPackageName').textContent = packageName;
        document.getElementById('summaryTotal').textContent = price;
        document.getElementById('bankAmount').textContent = price;

        if (paymentMethod === 'transfer') {
            bankDetails.style.display = 'block';
            slipInput.required = true;
            document.getElementById('btnActionText').textContent = `โอนเงิน ${price} บาท`;
        } else {
            bankDetails.style.display = 'none';
            slipInput.required = false;
            document.getElementById('btnActionText').textContent = `เก็บเงินปลายทาง ${price} บาท`;
        }
    }

    function copyAccount() {
        const accNum = "243-7-01662-5";
        navigator.clipboard.writeText(accNum).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = "คัดลอกสำเร็จ!";
            btn.classList.replace('text-[#0A1224]', 'text-green-600');
            btn.classList.replace('border-[#0A1224]', 'border-green-600');
            
            setTimeout(() => {
                btn.textContent = "คัดลอกเลขบัญชี";
                btn.classList.replace('text-green-600', 'text-[#0A1224]');
                btn.classList.replace('border-green-600', 'border-[#0A1224]');
            }, 2000);
        });
    }

    function showFormError(msg) {
    var el = document.getElementById('formError');
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
    if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

// Slips from a phone camera can be several MB: shrink anything over ~1.2 MB to max 1800 px JPEG so the upload is
// fast on mobile data and stays under the server's 5 MB limit. Small files are sent untouched.
function prepareSlip(file) {
    if (file.size <= 1.2 * 1024 * 1024) return readAsDataUrl(file);
    return new Promise(function (resolve) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
            var scale = Math.min(1, 1800 / Math.max(img.width, img.height));
            var c = document.createElement('canvas');
            c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // PNG transparency -> white
            ctx.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(readAsDataUrl(file)); };   // fall back to the original
        img.src = url;
    });
}

// show which slip was picked (name + small preview) right under the button
document.addEventListener('change', function (e) {
    if (e.target.id !== 'slipInput') return;
    var file = e.target.files && e.target.files[0];
    var name = document.getElementById('slipName'), prev = document.getElementById('slipPreview');
    if (!file) { name.classList.add('hidden'); prev.classList.add('hidden'); return; }
    name.textContent = '✓ เลือกไฟล์แล้ว: ' + file.name;
    name.classList.remove('hidden');
    if (prev.src) URL.revokeObjectURL(prev.src);
    prev.src = URL.createObjectURL(file);
    prev.classList.remove('hidden');
});

// ส่งออเดอร์ไปที่ API (ตั้ง window.KCUT_API ได้ถ้า API อยู่คนละโดเมน) แล้วค่อยพาไป LINE
async function submitCheckout(event) {
    event.preventDefault();
    var form = event.target;
    var btn = form.querySelector('button[type="submit"]');
    var originalHtml = btn.innerHTML;
    showFormError('');

    var f = form.elements;
    var pkg = form.querySelector('input[name="package"]:checked');
    var pay = form.querySelector('input[name="payment"]:checked');
    if (!f.zip.value || !f.subdistrict.value) {
        showFormError('กรุณาเลือกตำบล อำเภอ จังหวัด และรหัสไปรษณีย์ (พิมพ์รหัสไปรษณีย์หรือชื่อตำบลในช่องค้นหา)');
        document.getElementById('addrSearch').focus();
        return;
    }
    var slip = f.slip.files && f.slip.files[0];
    if (pay.value === 'transfer') {
        if (!slip) { showFormError('กรุณาแนบสลิปการโอนเงิน'); return; }
        if (slip.size > 20 * 1024 * 1024) { showFormError('ไฟล์สลิปใหญ่เกินไป กรุณาเลือกรูปที่เล็กกว่า 20 MB'); return; }
    }

    btn.innerHTML = 'กำลังประมวลผล...';
    btn.disabled = true;
    try {
        var payload = {
            package: pkg.value,
            payment: pay.value,
            firstName: f.firstName.value.trim(),
            lastName: f.lastName.value.trim(),
            phone: f.phone.value.trim(),
            email: f.email.value.trim(),
            address1: f.address1.value.trim(),
            subdistrict: f.subdistrict.options[f.subdistrict.selectedIndex].text,
            district: f.district.options[f.district.selectedIndex].text,
            province: f.province.options[f.province.selectedIndex].text,
            zip: f.zip.value,
            note: f.note.value.trim(),
            slip: pay.value === 'transfer' && slip ? { name: slip.name, dataUrl: await prepareSlip(slip) } : null
        };
        var res = await fetch((window.KCUT_API || '') + '/api/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || 'ส่งคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่หรือทักไลน์ @spgo');
        // Meta Pixel: value comes from the server response; eventID = order id lets a future Conversions API call dedupe
        if (typeof fbq === 'function') fbq('track', 'Purchase', { value: data.amount, currency: 'THB', content_ids: [pkg.value], content_name: pkg.dataset.name, content_type: 'product', num_items: 1 }, { eventID: data.orderId });
        btn.innerHTML = 'สั่งซื้อสำเร็จ เลขที่ ' + data.orderId + ' กำลังพาไปที่ LINE...';
        setTimeout(function () { window.location.href = 'https://lin.ee/YmWfY9Kv'; }, 2500);
    } catch (err) {
        showFormError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// เรียกใช้งานครั้งแรกตอนโหลดเว็บเพื่อให้ค่าตั้งต้นถูกต้อง
    document.addEventListener('DOMContentLoaded', updateSummary);

