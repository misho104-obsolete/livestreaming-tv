(function() {
  'use strict';

  var videoSrc = 'hls/stream.m3u8';
  var video;
  var timetable;
  var timeoutID;

  function parseJson(response) {
    return response.json();
  }

  function formatDate(date) {
    return date.getHours() + ':' + ('0' + date.getMinutes()).substr(-2);
  }

  function createDummyData(start, stop) {
    return {
      start: start,
      stop: stop,
      title: 'NO DATA',
      startObj: new Date(start),
      stopObj: new Date(stop),
      isDummy: true
    };
  }

  function removeChildren(element) {
    var child;
    while ((child = element.firstChild)) {
      element.removeChild(child);
    }
    return element;
  }

  function selectChannelViews(ch) {
    var elements = document.getElementsByClassName('selected');
    while (elements[0]) {
      elements[0].classList.remove('selected');
    }
    Array.prototype.forEach.call(document.getElementsByClassName('remocon-number-' + ch), function(element) {
      element.classList.add('selected');
    });
  }

  function selectChannel(event) {
    event.preventDefault();
    var ch = this.dataset.remoconNumber;
    var body = new FormData();
    body.append('ch', ch);
    fetch('channels/select', {
      method: 'post',
      body: body,
      mode: 'same-origin',
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function() {
      selectChannelViews(ch);
    });
    return false;
  }

  function getCurrentChannel() {
    clearTimeout(timeoutID);
    fetch('channels/current', {
      method: 'get',
      mode: 'same-origin',
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(parseJson).then(function(json) {
      selectChannelViews(json[1]);
      timeoutID = setTimeout(function() { getCurrentChannel(); }, 60 * 1000);
    });
  }

  function updateProgrammes() {
    fetch('programmes', {
      method: 'get',
      mode: 'same-origin',
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(parseJson).then(generateTimetable);
  }

  function generateTimetable(programmes) {
    timetable = timetable || document.getElementById('timetable');
    removeChildren(timetable);
    var now = new Date();
    now.setSeconds(0, 0);
    var actualLastDate = now;
    var lastDate = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    var channels = {};
    programmes.forEach(function(programme) {
      var start = new Date(programme.start);
      var stop = new Date(programme.stop);
      start.setSeconds(0, 0);
      stop.setSeconds(0, 0);
      // to ensure 'height' > 0
      if (now >= stop || start >= lastDate || start >= stop) {
        return;
      }
      if (!channels[programme.channel]) {
        channels[programme.channel] = {
          name: programme.name,
          remoconNumber: programme.remocon_number,
          programmes: [],
        };
      }
      if (actualLastDate < stop) {
        actualLastDate = stop;
      }
      programme.startObj = start;
      programme.stopObj = stop;
      channels[programme.channel].programmes.push(programme);
    });
    splittedChannelsMerge(channels);

    Object.keys(channels).forEach(function(channelId) {
      var programmes = channels[channelId].programmes;
      // head padding : Note that programmes.length is always non-zero.
      var firstProgrammeStart = programmes[0].startObj;
      if (firstProgrammeStart > now) {
        programmes.unshift(createDummyData(now, firstProgrammeStart));
      }
      // tail padding
      var lastProgrammeStop = programmes[programmes.length - 1].stopObj;
      if (actualLastDate > lastProgrammeStop) {
        programmes.push(createDummyData(lastProgrammeStop, actualLastDate));
      }
      // body padding
      var i, len;
      for (i = 1, len = programmes.length; i < len; ++i) {
        if (programmes[i - 1].stopObj < programmes[i].startObj) {
          programmes.splice(i, 0, createDummyData(programmes[i - 1].stopObj, programmes[i].startObj));
          i++;
          len++;
        }
      }
    });
    timetable.appendChild(generateTable(channels, now, actualLastDate));
    getCurrentChannel();
    setTimeout(updateProgrammes, calculateReloadInterval(channels));
  }

  function splittedChannelsMerge(channels) {
    // merge channels with same remoconNumber if programmes have no overlap.
    // This algorithm is not perfect (but does work to some extent) if 4 or more channels have the same reomconNumber.
    var channelIds = Object.keys(channels);
    var i, j, len = channelIds.length;
    for (i = 0; i < len - 1; i++) {
      for (j = i + 1; j < len; j++) {
        if (channels[channelIds[i]].remoconNumber == channels[channelIds[j]].remoconNumber) {
          var merged = splittedChannelsTryToMerge(channels[channelIds[i]], channels[channelIds[j]]);
          if (merged) {
            delete channels[channelIds[j]];
            channelIds.splice(j, 1);
            j--;
            len--;
          }
        }
      }
    }
  }

  function splittedChannelsTryToMerge(c1, c2) {
    // if possible, merge c2 into c1, and c1 is updated.
    // return whether merged or not.
    var merged = [], toMerge = c2.programmes;
    c1.programmes.forEach(function(programme) {
      merged.push(programme);
    });
    var i = 0, j = 0, len = toMerge.length;
    while (j < len) {
      // try to insert toMerge[j] before merged[i].
      if (i >= merged.length) {
        merged.push(toMerge[j++]);
      } else if (toMerge[j].startObj > merged[i].startObj) {
        i++;
      } else {
        if (toMerge[j].stopObj > merged[i].startObj) {
          return false;
        }
        merged.splice(i, 0, toMerge[j++])
      }
    }
    c1.programmes = merged;
    return true;
  }

  function calculateReloadInterval(channels) {
    var nextReloadTime;
    Object.keys(channels).forEach(function(channelId) {
      if (!nextReloadTime || nextReloadTime > channels[channelId].programmes[0].stopObj) {
        nextReloadTime = channels[channelId].programmes[0].stopObj;
      }
    });
    var interval = nextReloadTime - (new Date());
    return (interval > 0) ? interval : 5 * 60 * 1000;
  }

  function generateTable(channels, firstDateToShow, lastDateToShow) {
    var table = document.createElement('table');
    table.classList.add('mdl-data-table');
    table.appendChild(generateTableHeader(channels));
    table.appendChild(generateTableBody(channels, firstDateToShow, lastDateToShow));
    return table;
  }

  function generateTableHeader(channels) {
    var channelIds = Object.keys(channels);
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    var width = (100 / channelIds.length) + '%';
    channelIds.forEach(function(channelId) {
      var channel = channels[channelId];
      var remoconNumber = channel.remoconNumber;
      var th = document.createElement('th');
      th.classList.add('remocon-number-' + remoconNumber);
      th.classList.add('mdl-data-table__cell--non-numeric');
      th.setAttribute('width', width);
      var anchor = document.createElement('a');
      anchor.textContent = channel.name;
      anchor.id = 'remocon-number-' + remoconNumber;
      anchor.dataset.remoconNumber = remoconNumber;
      anchor.href = 'javascript:void(0);';
      anchor.addEventListener('click', selectChannel);
      th.appendChild(anchor);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  }

  function fillTd(td, programme){
    if (programme.isDummy) {
      td.classList.add('empty');
    } else {
      var strong = document.createElement('strong');
      strong.textContent = formatDate(programme.startObj);
      td.appendChild(strong);
      var text = document.createTextNode(' ' + programme.title);
      td.appendChild(text);
    }
  }

  function generateTableBody(channels, head, tail) {
    var tbody = document.createElement('tbody');
    var count = Math.floor((tail - head) / 60000);
    var timetableRows = new Array(count);
    var i, len;
    for (i = 0, len = timetableRows.length; i < len; ++i) {
      timetableRows[i] = [];
    }
    Object.keys(channels).forEach(function(channelId) {
      var programmes = channels[channelId].programmes;
      programmes.forEach(function(programme) {
        var start = programme.startObj;
        if (start < head) {
          start = head;
        }
        var pos = Math.floor((start - head) / 60000);
        programme.height = Math.floor((programme.stopObj - start) / 60000);
        if (0 > pos || pos >= len) {
          return;
        }
        timetableRows[pos].push(programme);
      });
    });
    timetableRows.forEach(function(timetableRow) {
      var tr = document.createElement('tr');
      timetableRow.forEach(function(programme) {
        var remoconNumber = programme.remocon_number;
        var td = document.createElement('td');
        td.classList.add('remocon-number-' + remoconNumber);
        td.classList.add('mdl-data-table__cell--non-numeric');
        fillTd(td, programme);
        td.setAttribute('valign', 'top');
        td.setAttribute('rowspan', programme.height);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return tbody;
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
    updateProgrammes();
  }

  window.addEventListener('keyup', function(event) {
    if (event.keyCode === 84) {
      capture();
    }
  });
  document.addEventListener('DOMContentLoaded', bind);
})();
