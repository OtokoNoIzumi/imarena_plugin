// LMArena自动刷新插件 - 后台脚本
console.log('LMArena自动刷新插件后台脚本已启动');

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener((details) => {
  console.log('插件已安装/更新:', details.reason);

  if (details.reason === 'install') {
    console.log('首次安装插件');
    // 可以在这里设置默认配置或显示欢迎消息
  } else if (details.reason === 'update') {
    console.log('插件已更新到版本:', chrome.runtime.getManifest().version);
  }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('后台脚本收到消息:', request);

  try {
    switch (request.action) {
      case 'operationUpdate':
        // 处理操作更新消息
        console.log(`操作更新 - 计数: ${request.count}, 下载: ${request.downloads}, 状态: ${request.status}`);
        console.log('操作更新详情:', JSON.stringify(request, null, 2));

        // 可以在这里更新badge或发送通知
        if (request.count % 15 === 0) {
          // 每15次操作显示一个通知
          const message = `已完成 ${request.count} 次刷新操作，成功下载 ${request.downloads || 0} 次`;
          console.log('发送进度通知:', message);
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'LMArena自动刷新',
            message: message
          }).catch(err => console.log('通知发送失败:', err));
        }
        break;

      case 'error':
        // 处理错误消息
        // 可以用 includes 或 Array.includes 判断字符串是否包含在某个集合里
        if (!["未找到下载按钮", "循环已停止"].includes(request.error)) {
          console.error('收到错误报告:', request.error);
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'LMArena自动刷新 - 错误',
            message: request.error
          }).catch(err => console.log('错误通知发送失败:', err));
        }

        break;

      case 'loopStopped':
        // 处理循环停止消息
        console.log('循环已停止:', request);
        console.log('请求对象详情:', JSON.stringify(request, null, 2));

        // 发送完成通知，显示完整的运行报告
        const report = request.report;
        console.log('提取的报告对象:', report);

        if (report && report.totalRefreshes !== undefined) {
          const message = `循环结束 - 刷新: ${report.totalRefreshes}次, 下载: ${report.successfulDownloads}次, 成功率: ${report.successRate}%, 耗时: ${report.totalTimeFormatted}`;
          console.log('发送通知消息:', message);
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'LMArena自动刷新',
            message: message
          }).catch(err => console.log('完成通知发送失败:', err));
        } else {
          // 兼容旧版本，如果没有report对象或report不完整
          console.warn('报告对象不完整，使用备用信息');
          const message = `循环结束 - 共执行 ${request.count || 0} 次操作`;
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'LMArena自动刷新',
            message: message
          }).catch(err => console.log('完成通知发送失败:', err));
        }
        break;

      default:
        console.warn('未知的消息action:', request.action);
        break;
    }
  } catch (error) {
    console.error('处理后台消息时发生错误:', error);
  }

  // 返回true表示异步处理消息
  return true;
});

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 当标签页完成加载且URL是lmarena.ai时
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('lmarena.ai')) {
    console.log('检测到lmarena.ai页面加载完成:', tab.url);

    // 可以在这里执行一些初始化操作
    // 例如：重置插件状态、注入样式等
  }
});

// 插件被禁用或卸载时的清理
chrome.runtime.onSuspend.addListener(() => {
  console.log('插件即将被挂起，执行清理操作');
  // 在这里可以保存状态、清理资源等
});

// 处理插件图标点击事件（如果没有popup的话）
chrome.action.onClicked.addListener((tab) => {
  // 由于我们有popup.html，这个事件通常不会触发
  // 但可以作为备用方案
  console.log('插件图标被点击，当前标签页:', tab.url);

  if (tab.url && tab.url.includes('lmarena.ai')) {
    // 如果在lmarena.ai页面，可以直接发送消息给content script
    chrome.tabs.sendMessage(tab.id, { action: 'toggleLoop' });
  } else {
    // 如果不在目标页面，可以打开目标页面
    chrome.tabs.create({ url: 'https://lmarena.ai' });
  }
});

// 错误处理
chrome.runtime.onStartup.addListener(() => {
  console.log('浏览器启动，后台脚本重新加载');
});

// 全局错误捕获
self.addEventListener('error', (event) => {
  console.error('后台脚本全局错误:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('后台脚本未处理的Promise拒绝:', event.reason);
});
