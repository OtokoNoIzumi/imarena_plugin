// 🔥 重要配置：刷新间隔设置（方便调试修改）
// 注意：这个值现在由content.js控制，实际刷新间隔为10分钟

document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');
  const positionBtns = document.querySelectorAll('.position-btn');
  const maxOperationsInput = document.getElementById('maxOperations');
  const maxDownloadsInput = document.getElementById('maxDownloads');
  const autoStartCheckbox = document.getElementById('autoStart');
  const refreshCountdownDiv = document.getElementById('refreshCountdown');
  const countdownTimerSpan = document.getElementById('countdownTimer');
  const reportDiv = document.getElementById('report');
  const reportContentDiv = document.getElementById('reportContent');

  // 🔥 新增：日志管理按钮
  const viewLogsBtn = document.getElementById('viewLogsBtn');
  const exportLogsBtn = document.getElementById('exportLogsBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

  // 当前选择的按钮位置
  let selectedPosition = 'first';

  // 自动启动相关变量
  let autoStartEnabled = false;

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

    // 保存设置
    saveSettings();
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
        <span>${report.operationCount}</span>
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

  // 保存设置到本地存储
  function saveSettings() {
    const settings = {
      autoStart: autoStartEnabled,
      maxOperations: maxOperationsInput.value,
      maxDownloads: maxDownloadsInput.value,
      position: selectedPosition
    };
    chrome.storage.local.set(settings);
  }

  // 从本地存储加载设置
  function loadSettings() {
    chrome.storage.local.get(['autoStart', 'maxOperations', 'maxDownloads', 'position'], function(result) {
      if (result.autoStart !== undefined) {
        autoStartCheckbox.checked = result.autoStart;
        autoStartEnabled = result.autoStart;
      }
      if (result.maxOperations) maxOperationsInput.value = result.maxOperations;
      if (result.maxDownloads) maxDownloadsInput.value = result.maxDownloads;
      if (result.position) {
        selectedPosition = result.position;
        // 更新UI显示
        positionBtns.forEach(btn => {
          btn.classList.toggle('selected', btn.dataset.position === selectedPosition);
        });
      }
    });
  }

    // 启动自动刷新（总是运行，无需勾选）
  function startAutoRefresh() {
    // 移除倒计时逻辑，现在由content.js控制页面刷新时机
    console.log('✅ 自动刷新功能已启用，将在需要时自动执行页面刷新');
  }

  // 停止自动刷新
  function stopAutoRefresh() {
    // 移除倒计时逻辑
    console.log('✅ 自动刷新功能已禁用');
  }

  // 启动自动刷新倒计时（在开始执行时调用）
  function startRefreshCountdown() {
    // 现在由content.js控制，这里只显示状态
    refreshCountdownDiv.style.display = 'block';
    countdownTimerSpan.textContent = '已启用';
  }

  // 更新倒计时显示
  function updateCountdown() {
    // 简化显示，只显示已启用状态
    countdownTimerSpan.textContent = '已启用';
    refreshCountdownDiv.style.display = 'block';
  }

  // 执行自动刷新
  function performAutoRefresh() {
    console.log('🔄 执行自动刷新...');
    updateStatus('自动刷新中', '正在刷新页面以避免Cloudflare会话过期...');

    // 发送消息给content script执行刷新
    sendMessageToTab('performAutoRefresh', function(response) {
      if (response && response.success) {
        console.log('✅ 自动刷新成功');
      } else {
        console.error('❌ 自动刷新失败:', response ? response.error : '未知错误');
      }
    });
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

  // 🔥 新增：查看日志
  function viewLogs() {
    sendMessageToTab('getLogs', function(response) {
      if (response && response.success) {
        const logs = response.logs;
        if (logs.length === 0) {
          alert('暂无日志记录');
          return;
        }

                // 显示最近的日志
        const recentLogs = logs.slice(-20); // 显示最近20条
        const logText = recentLogs.map(log => {
          const time = new Date(log.timestamp).toLocaleString();
          const level = log.level.toUpperCase().padEnd(5);
          const category = log.category.toUpperCase().padEnd(10);

          // 如果有详细数据，添加到日志中
          let logLine = `[${time}] ${level} [${category}] ${log.message}`;

          // 添加关键数据信息
          if (log.data) {
            if (log.data.operationCount !== undefined) {
              logLine += ` (${log.data.operationCount}/${log.data.maxOperations}生成, ${log.data.successfulDownloads}/${log.data.maxDownloads}下载)`;
            }
            if (log.data.verificationDuration) {
              logLine += ` (验证耗时: ${log.data.verificationDuration})`;
            }
            if (log.data.reason) {
              logLine += ` (原因: ${log.data.reason})`;
            }
          }

          return logLine;
        }).join('\n');

        alert(`最近${recentLogs.length}条日志：\n\n${logText}`);
      } else {
        alert('获取日志失败: ' + (response ? response.error : '未知错误'));
      }
    });
  }

  // 🔥 新增：导出日志
  function exportLogs() {
    sendMessageToTab('exportLogs', function(response) {
      if (response && response.success) {
        alert(`日志导出成功！共导出${response.count}条记录`);
      } else {
        alert('日志导出失败: ' + (response ? response.error : '未知错误'));
      }
    });
  }

  // 🔥 新增：清理日志
  function clearLogs() {
    if (confirm('确定要清理所有日志吗？此操作不可恢复。')) {
      sendMessageToTab('clearLogs', function(response) {
        if (response && response.success) {
          alert('日志清理成功！');
        } else {
          alert('日志清理失败: ' + (response ? response.error : '未知错误'));
        }
      });
    }
  }

  // 为所有位置按钮添加点击事件
  positionBtns.forEach(btn => {
    btn.addEventListener('click', () => handlePositionSelection(btn));
  });

  // 🔥 新增：日志管理按钮事件监听器
  viewLogsBtn.addEventListener('click', function() {
    console.log('用户点击查看日志按钮');
    viewLogs();
  });

  exportLogsBtn.addEventListener('click', function() {
    console.log('用户点击导出日志按钮');
    exportLogs();
  });

  clearLogsBtn.addEventListener('click', function() {
    console.log('用户点击清理日志按钮');
    clearLogs();
  });

  // 自动启动复选框事件监听
  autoStartCheckbox.addEventListener('change', function() {
    autoStartEnabled = this.checked;
    if (autoStartEnabled) {
      updateStatus('已停止', `已启用自动启动，页面加载后将自动开始执行`);
    } else {
      updateStatus('已停止', `已禁用自动启动`);
    }
    saveSettings();
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

        // 启动30分钟倒计时
        startRefreshCountdown();

        // 保存设置
        saveSettings();
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

        // 停止30分钟倒计时
        stopAutoRefresh();

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
    } else if (message.action === 'autoRefreshRestored') {
      // 自动刷新状态恢复
      console.log('🔄 收到自动刷新状态恢复消息:', message.state);

      // 更新UI状态
      updateStatus('运行中', `自动刷新后已恢复运行 (${message.state.operationCount}/${message.state.maxOperations}刷新, ${message.state.successfulDownloads}/${message.state.maxDownloads}下载)`);
      startBtn.disabled = true;
      stopBtn.disabled = false;
      testBtn.disabled = true;

      // 更新输入框
      maxOperationsInput.value = message.state.maxOperations;
      maxDownloadsInput.value = message.state.maxDownloads;
      maxOperationsInput.disabled = true;
      maxDownloadsInput.disabled = true;

      // 更新位置选择
      selectedPosition = message.state.selectedPosition;
      positionBtns.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.position === selectedPosition);
      });

      // 如果启用了自动启动，重新启动倒计时
      if (autoStartEnabled) {
        startRefreshCountdown();
      }
    } else if (message.action === 'getAutoStartSetting') {
      // 处理来自content script的getAutoStartSetting消息
      sendResponse({ autoStart: autoStartEnabled });
    }
  });

  // 加载保存的设置
  loadSettings();

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

        // 如果正在运行，启动倒计时显示
        startRefreshCountdown();
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
