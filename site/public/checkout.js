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

    function submitCheckout(event) {
        event.preventDefault(); // ป้องกันการรีเฟรชหน้า
        
        // ดึงปุ่มมาเปลี่ยนข้อความระหว่างรอโหลด
        const btn = event.target.querySelector('button[type="submit"]');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = 'กำลังประมวลผล...';
        btn.disabled = true;

        // จำลองการส่งข้อมูล 1 วินาที แล้วเด้งไปหน้าแอด LINE
        setTimeout(() => {
            window.location.href = "https://lin.ee/YmWfY9Kv";
        }, 1000);
    }

    // เรียกใช้งานครั้งแรกตอนโหลดเว็บเพื่อให้ค่าตั้งต้นถูกต้อง
    document.addEventListener('DOMContentLoaded', updateSummary);

