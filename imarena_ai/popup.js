document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');
  const positionBtns = document.querySelectorAll('.position-btn');
  const maxOperationsInput = document.getElementById('maxOperations');
  const maxDownloadsInput = document.getElementById('maxDownloads');
  const reportDiv = document.getElementById('report');
  const reportContentDiv = document.getElementById('reportContent');

  // 当前选择的按钮位置
  let selectedPosition = 'first';

  // 更新状态显示
  function updateStatus(text, info = '') {
    statusDiv.innerHTML = `
      <div>状态: ${text}</div>
      <div class="status-info">${info}</div>
    `;
  }

  // 处理位置按钮选择
  function handlePositionSelection(clickedBtn) {
    // 移除所有选中状态
    positionBtns.forEach(btn => btn.classList.remove('selected'));
    // 添加选中状态到点击的按钮
    clickedBtn.classList.add('selected');
    // 更新选择的位置
    selectedPosition = clickedBtn.dataset.position;

    console.log('选择按钮位置:', selectedPosition);

    // 更新状态信息
    updateStatus('已停止', `已选择: ${getPositionText(selectedPosition)}，可以点击"测试"或"开始"`);
  }

  // 获取位置的中文描述
  function getPositionText(position) {
    const positionMap = {
      'first': '左侧按钮',
      'last': '右侧按钮'
    };
    return positionMap[position] || position;
  }

  // 显示运行报告
  function showReport(report) {
    const reportContent = `
      <div class="report-item">
        <span>停止原因:</span>
        <span>${getStopReasonText(report.reason)}</span>
      </div>
      <div class="report-item">
        <span>总生成次数:</span>
        <span>${report.totalRefreshes}</span>
      </div>
      <div class="report-item">
        <span>成功下载:</span>
        <span>${report.successfulDownloads}</span>
      </div>
      <div class="report-item">
        <span>成功率:</span>
        <span>${report.successRate}%</span>
      </div>
      <div class="report-item">
        <span>总耗时:</span>
        <span>${report.totalTimeFormatted}</span>
      </div>
    `;
    reportContentDiv.innerHTML = reportContent;
    reportDiv.style.display = 'block';
  }

  // 隐藏运行报告
  function hideReport() {
    reportDiv.style.display = 'none';
  }

  // 获取停止原因的中文描述
  function getStopReasonText(reason) {
    switch (reason) {
      case 'manual': return '手动停止';
      case 'reached_max_operations': return '达到最大图片生成次数';
      case 'reached_max_downloads': return '达到最大下载数量';
      case 'website_problem': return '网站问题（200秒超时）';
      case 'error': return '发生错误';
      default: return '未知原因';
    }
  }

  // 为所有位置按钮添加点击事件
  positionBtns.forEach(btn => {
    btn.addEventListener('click', () => handlePositionSelection(btn));
  });

  // 发送消息到当前活动标签页的content script
  function sendMessageToTab(action, callback, extraParams = {}) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        // 在消息中包含选择的位置信息和其他参数
        const message = {
          action: action,
          position: selectedPosition,
          ...extraParams
        };

        chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
          if (chrome.runtime.lastError) {
            console.error('消息发送失败:', chrome.runtime.lastError.message);
            callback && callback({success: false, error: chrome.runtime.lastError.message});
          } else {
            callback && callback(response);
          }
        });
      } else {
        callback && callback({success: false, error: '没有找到活动标签页'});
      }
    });
  }

  // 测试按钮选择
  testBtn.addEventListener('click', function() {
    console.log('用户点击测试按钮，选择位置:', selectedPosition);
    updateStatus('测试中', `正在测试${getPositionText(selectedPosition)}...`);

    sendMessageToTab('testClick', function(response) {
      if (response && response.success) {
        updateStatus('测试成功', `成功点击${getPositionText(selectedPosition)}，可以开始自动生成图片`);
        console.log('测试成功');
      } else {
        const errorMsg = response ? response.error : '测试失败';
        updateStatus('测试失败', errorMsg);
        console.error('测试失败:', errorMsg);
      }
    });
  });

  // 启动自动刷新
  startBtn.addEventListener('click', function() {
    // 获取停止条件设置
    const maxOperations = parseInt(maxOperationsInput.value) || 100;
    const maxDownloads = parseInt(maxDownloadsInput.value) || 50;

    console.log('用户点击启动按钮，选择位置:', selectedPosition);
    console.log('停止条件:', {maxOperations, maxDownloads});

    // 隐藏之前的报告
    hideReport();

    sendMessageToTab('startLoop', function(response) {
      if (response && response.success) {
        updateStatus('运行中', `正在自动点击${getPositionText(selectedPosition)}... (最多${maxOperations}次生成，${maxDownloads}次下载)`);
        startBtn.disabled = true;
        stopBtn.disabled = false;
        testBtn.disabled = true;
        // 禁用输入框
        maxOperationsInput.disabled = true;
        maxDownloadsInput.disabled = true;
        console.log('启动成功');
      } else {
        const errorMsg = response ? response.error : '启动失败';
        updateStatus('启动失败', errorMsg);
        console.error('启动失败:', errorMsg);
      }
    }, {
      maxOperations: maxOperations,
      maxDownloads: maxDownloads
    });
  });

  // 停止自动刷新
  stopBtn.addEventListener('click', function() {
    console.log('用户点击停止按钮');
    sendMessageToTab('stopLoop', function(response) {
      if (response && response.success) {
        updateStatus('已停止', `已手动停止自动刷新，当前选择: ${getPositionText(selectedPosition)}`);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        testBtn.disabled = false;
        // 重新启用输入框
        maxOperationsInput.disabled = false;
        maxDownloadsInput.disabled = false;

        // 显示报告（如果有的话）
        if (response.report) {
          showReport(response.report);
        }

        console.log('停止成功');
      } else {
        console.error('停止失败:', response ? response.error : '未知错误');
      }
    });
  });

  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('收到来自content script的消息:', message);

    if (message.action === 'operationUpdate') {
      // 实时更新运行状态
      const statusText = `运行中 (${message.count}/${maxOperationsInput.value}刷新, ${message.downloads}/${maxDownloadsInput.value}下载)`;
      const infoText = `${getPositionText(selectedPosition)} - 耗时: ${message.elapsedTimeFormatted || '计算中...'}`;
      updateStatus(statusText, infoText);
    } else if (message.action === 'loopStopped') {
      // 自动停止时显示报告
      updateStatus('已停止', `自动停止: ${getStopReasonText(message.report.reason)}`);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      testBtn.disabled = false;
      // 重新启用输入框
      maxOperationsInput.disabled = false;
      maxDownloadsInput.disabled = false;

      showReport(message.report);
    } else if (message.action === 'error') {
      // updateStatus('发生错误', message.error);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      testBtn.disabled = false;
      // 重新启用输入框
      maxOperationsInput.disabled = false;
      maxDownloadsInput.disabled = false;
    }
  });

  // 获取当前状态
  sendMessageToTab('getStatus', function(response) {
    if (response) {
      if (response.running) {
        const statusText = `运行中 (${response.operationCount}/${response.maxOperations}刷新, ${response.successfulDownloads}/${response.maxDownloads}下载)`;
        const infoText = `${getPositionText(selectedPosition)} - 耗时: ${response.elapsedTimeFormatted}`;
        updateStatus(statusText, infoText);
        startBtn.disabled = true;
        stopBtn.disabled = false;
        testBtn.disabled = true;
        // 禁用输入框并设置当前值
        maxOperationsInput.value = response.maxOperations;
        maxDownloadsInput.value = response.maxDownloads;
        maxOperationsInput.disabled = true;
        maxDownloadsInput.disabled = true;
      } else {
        updateStatus('已停止', `已选择: ${getPositionText(selectedPosition)}，可以点击"测试"或"开始"`);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        testBtn.disabled = false;
        maxOperationsInput.disabled = false;
        maxDownloadsInput.disabled = false;
      }
    } else {
      updateStatus('未知', '请确保已打开lmarena.ai页面');
    }
  });
});
