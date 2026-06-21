export class VideoSyncManager {
  constructor(options) {
    this.videoContent = options.videoContent;
    this.toggleOverlay = options.toggleOverlay;
    this.onLocalAction = options.onLocalAction; // Callback: (type, data)
    this.addSystemMessage = options.addSystemMessage;

    this.ytPlayer = null;
    this.isRemoteChange = false;
    this.videoType = null; // 'youtube', 'native', 'iframe'
  }

  startVideo(url, shouldSync = false) {
    this.toggleOverlay(true);
    this.videoContent.innerHTML = '';
    
    const isDirectVideo = url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i);
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');

    if (isYoutube) {
      const videoId = this.extractYoutubeId(url);
      if (videoId) {
        this.videoType = 'youtube';
        const playerDiv = document.createElement('div');
        playerDiv.id = 'yt-player-element';
        this.videoContent.appendChild(playerDiv);

        this.ytPlayer = new window.YT.Player('yt-player-element', {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            'autoplay': 1,
            'controls': 1,
            'rel': 0,
            'origin': window.location.origin
          },
          events: {
            'onStateChange': (event) => this.handleYoutubeStateChange(event)
          }
        });
      } else {
        this.addSystemMessage('Invalid YouTube URL.');
        this.toggleOverlay(false);
        return;
      }
    } else if (isDirectVideo) {
      this.videoType = 'native';
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.background = '#000';
      this.videoContent.appendChild(video);

      video.addEventListener('play', () => this.handleNativeVideoAction('play'));
      video.addEventListener('pause', () => this.handleNativeVideoAction('pause'));
      video.addEventListener('seeked', () => this.handleNativeVideoAction('seek', video.currentTime));
    } else {
      this.videoType = 'iframe';
      this.videoContent.innerHTML = `<iframe src="${url}" frameborder="0" allowfullscreen allow="autoplay; fullscreen" referrerpolicy="no-referrer" style="width:100%; height:100%; border:none; background:#000;"></iframe>`;
    }

    if (shouldSync) {
      this.onLocalAction('video_start', { url });
    }
  }

  handleYoutubeStateChange(event) {
    if (this.isRemoteChange) return;

    if (event.data === window.YT.PlayerState.PLAYING) {
      this.syncVideoAction('play');
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      this.syncVideoAction('pause');
    } else if (event.data === window.YT.PlayerState.BUFFERING) {
      this.syncVideoAction('seek', this.ytPlayer.getCurrentTime());
    }
  }

  handleNativeVideoAction(type, time = null) {
    if (this.isRemoteChange) return;
    this.syncVideoAction(type, time);
  }

  syncVideoAction(type, time = null) {
    const payload = {};
    if (time !== null) payload.time = time;
    this.onLocalAction(`video_${type}`, payload);
  }

  handleRemoteVideoAction(type, time = null) {
    this.isRemoteChange = true;
    
    if (this.videoType === 'youtube' && this.ytPlayer) {
      if (type === 'play') {
        this.ytPlayer.playVideo();
        this.addSystemMessage('Stranger resumed the video.');
      }
      else if (type === 'pause') {
        this.ytPlayer.pauseVideo();
        this.addSystemMessage('Stranger paused the video.');
      }
      else if (type === 'seek') {
        this.ytPlayer.seekTo(time, true);
        this.addSystemMessage('Stranger jumped to a different time.');
      }
    } else if (this.videoType === 'native') {
      const video = this.videoContent.querySelector('video');
      if (video) {
        if (type === 'play') {
          video.play();
          this.addSystemMessage('Stranger resumed the video.');
        }
        else if (type === 'pause') {
          video.pause();
          this.addSystemMessage('Stranger paused the video.');
        }
        else if (type === 'seek') {
          video.currentTime = time;
          this.addSystemMessage('Stranger jumped to a different time.');
        }
      }
    }

    setTimeout(() => {
      this.isRemoteChange = false;
    }, 500);
  }

  extractYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  stopVideo() {
    this.videoContent.innerHTML = '';
    this.videoType = null;
    this.ytPlayer = null;
  }
}
