(function() {
  'use strict';

  var videoSrc = 'hls/stream.m3u8';
  var video;

  function parseJson(response) {
    return response.json();
  }

  function formatDate(date) {
    return date.getHours() + ':' + ('0' + date.getMinutes()).substr(-2);
  }

  function selectChannel(event) {
    var ch = event.target.getAttribute('id');
    var body = new FormData();
    body.append('ch', ch);
    fetch('channels/select', {
      method: 'post',
      body: body,
      mode: 'same-origin',
      credentials: 'same-origin',
      cache: 'no-store'
    });
  }

  function getCurrentChannel() {
    console.log("getCurrentChannel()");
    fetch('channels/current', {
      method: 'get',
      mode: 'same-origin',
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(parseJson).then(function(json) {
      [].forEach.call(document.getElementsByClassName('selected'), function(element) {
        element.classList.remove('selected');
      });
      [].forEach.call(document.getElementsByClassName(json[1]), function(element) {
        element.classList.add('selected');
      });
      setTimeout(function() { getCurrentChannel(); }, 60000);
    });
  }

  function initProgrammes(programmes) {
    var timetable = document.getElementById('timetable');
    var table = document.createElement('table');
    table.setAttribute('border', '1');
    var channels = {};
    programmes.forEach(function(programme) {
      if (typeof channels[programme.name] === 'undefined') {
        channels[programme.name] = [];
      }
      channels[programme.name].push(programme);
    });

    {
      var tr = document.createElement('tr');
      var width = (100 / Object.keys(channels).length) + '%';
      Object.keys(channels).forEach(function(key) {
        var remoconNumber = channels[key][0].remocon_number;
        var th = document.createElement('th');
	th.className = remoconNumber;
        th.setAttribute('width', width);
	var anchor = document.createElement('a');
	anchor.textContent = key;
	anchor.id = remoconNumber;
	anchor.setAttribute('href', 'javascript:void(0)');
        anchor.addEventListener('click', selectChannel);
	th.appendChild(anchor);
        tr.appendChild(th);
      });
      table.appendChild(tr);
    }
    getCurrentChannel();

    var now = new Date();
    for (var i = 0; i < 6 * 60; i++) {
      var tr = document.createElement('tr');
      Object.keys(channels).forEach(function(key) {
        for (var j = 0; j < channels[key].length; j++) {
          var programme = channels[key][j];
          var start = new Date(programme.start);
          var stop = new Date(programme.stop);
          var pos = Math.floor((start - now) / 60000);
          var remoconNumber = channels[key][0].remocon_number;
	  var height;
	  if (i == pos) {
            height = Math.floor((stop - start) / 60000);
	  } else {
            height = Math.floor((stop - now) / 60000);
	  }
	  if ((i == 0 && j == 0) || i == pos) {
            var td = document.createElement('td');
	    td.className = remoconNumber;
            td.innerHTML = [formatDate(start) + '-' + formatDate(stop), programme.title].join('<br>');
            td.setAttribute('valign', 'top');
            td.setAttribute('rowspan', height);
            tr.appendChild(td);
          }
        };
      });
      table.appendChild(tr);
    }
    timetable.appendChild(table);
  }

  function capture() {
    if (typeof video === 'undefined') {
      return;
    }
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var body = new FormData();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    body.append('url', canvas.toDataURL());
    fetch('tweet', {
      method: 'post',
      body: body,
      mode: 'same-origin',
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function() {
      canvas = undefined;
    });
  }

  function bind() {
    var hls;
    video = document.getElementById('video');
    if (video.canPlayType('application/vnd.apple.mpegURL')) {
      video.setAttribute('src', videoSrc);
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(videoSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PASED, video.play.bind(video));
    } else {
      return;
    }
    fetch('programmes', {
      method: 'get',
      mode: 'same-origin',
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(parseJson).then(initProgrammes);
  }

  window.addEventListener('keyup', function(event) {
    if (event.keyCode === 84) {
      capture();
    }
  });
  document.addEventListener('DOMContentLoaded', bind);
})();
