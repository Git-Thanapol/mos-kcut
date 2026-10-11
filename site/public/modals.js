function openVideoModal(videoUrl) {
        const modal = document.getElementById('videoModal');
        const modalContent = document.getElementById('videoModalContent');
        const videoPlayer = document.getElementById('popupVideoPlayer');
        
        videoPlayer.src = videoUrl;
        modal.classList.remove('hidden');
        
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
            modalContent.classList.add('scale-100');
            videoPlayer.play();
        }, 10);
    }

    function closeVideoModal() {
        const modal = document.getElementById('videoModal');
        const modalContent = document.getElementById('videoModalContent');
        const videoPlayer = document.getElementById('popupVideoPlayer');
        
        modal.classList.add('opacity-0');
        modalContent.classList.remove('scale-100');
        modalContent.classList.add('scale-95');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            videoPlayer.pause();
            videoPlayer.src = ""; 
        }, 300);
    }

    document.getElementById('videoModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeVideoModal();
        }
    });

function openImageModal(imgSrc) {
        const modal = document.getElementById('imageModal');
        const modalContent = document.getElementById('imageModalContent');
        const popupImg = document.getElementById('popupImage');
        
        popupImg.src = imgSrc;
        modal.classList.remove('hidden');
        
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
            modalContent.classList.add('scale-100');
        }, 10);
    }

    function closeImageModal() {
        const modal = document.getElementById('imageModal');
        const modalContent = document.getElementById('imageModalContent');
        
        modal.classList.add('opacity-0');
        modalContent.classList.remove('scale-100');
        modalContent.classList.add('scale-95');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            document.getElementById('popupImage').src = "";
        }, 300);
    }

    // ปิด Popup เมื่อคลิกที่พื้นหลังสีดำ
    document.getElementById('imageModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeImageModal();
        }
    });

