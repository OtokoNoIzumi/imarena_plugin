// LMArena自动刷新插件 - 内容脚本
console.log('LMArena自动刷新插件已加载');

// 全局状态变量
let loopRunning = false;
let refreshInterval = null;
let operationCount = 0;
let successfulDownloads = 0; // 成功下载的图片数量
let selectedPosition = 'first'; // 默认选择第一个
let startTime = null; // 循环开始时间

// 🔥 新增：会话过期检测相关变量
let lastOperationTime = null; // 上次操作时间
let shortIntervalCount = 0; // 连续短间隔次数
const SHORT_INTERVAL_THRESHOLD = 4000; // 短间隔阈值（4秒）
const MAX_SHORT_INTERVALS = 3; // 最大连续短间隔次数

// 🔥 新增：日志系统相关变量
const LOG_MAX_ENTRIES = 100; // 最大日志条数
const LOG_ENTRY_TTL = 2 * 24 * 60 * 60 * 1000; // 日志保留2天

// 状态管理
let initialState = {
  refreshButtonCount: 0,
  selectedRefreshButton: null,
  refreshButtonSelector: null,
  clickedRefreshButtonIndex: null // 记录点击的刷新按钮序号
};

// 配置参数
// 🔥 重要配置：方便调试修改
const REFRESH_INTERVAL_CONFIG = 30 * 60 * 1000;

const CONFIG = {
  // 刷新按钮的选择器（已验证有效）
  refreshSelectors: [
    'button[data-sentry-element="TooltipTrigger"]', // 主要选择器
  ],
  refreshInterval: 3000, // 刷新间隔3秒（作为备用）
  maxOperations: 100, // 最大操作次数（默认值，可由用户设置）
  maxDownloads: 50, // 最大下载数量（默认值，可由用户设置）
  maxWaitTime: 60000, // 短期等待时间60秒（网络延迟）
  longWaitTime: 200000, // 长期等待时间200秒（网站问题阈值）
  checkInterval: 1000, // 状态检查间隔1秒

  // 🔥 重要配置：下载按钮查找设置
  maxDownloadAttempts: 1, // 每轮最多尝试查找下载按钮的次数
  downloadCheckInterval: 2000, // 每次查找下载按钮的间隔（2秒）
};

// 查找刷新按钮的函数
function findRefreshButton() {
  // 首先找到所有可能的按钮
  let candidateButtons = [];

  // 尝试所有选择器找到刷新按钮
  for (let selector of CONFIG.refreshSelectors) {
    // console.log(`🔍 尝试选择器: ${selector}`);
    const buttons = document.querySelectorAll(selector);
    // console.log(`  找到 ${buttons.length} 个按钮`);

    buttons.forEach((btn, index) => {
      if (btn && btn.offsetParent !== null) { // 确保按钮可见
        // console.log(`  ✅ 按钮 ${index + 1}: 可见，添加到候选列表`);
        candidateButtons.push(btn);
      } else {
        console.log(`  ❌ 按钮 ${index + 1}: 不可见，跳过`);
      }
    });
  }

  // 如果没找到，尝试通过文本内容查找
  if (candidateButtons.length === 0) {
    const allButtons = document.querySelectorAll('button');
    for (let button of allButtons) {
      const text = button.textContent.toLowerCase();
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const title = (button.getAttribute('title') || '').toLowerCase();

      if (text.includes('refresh') || text.includes('刷新') ||
          ariaLabel.includes('refresh') || title.includes('refresh')) {
        if (button.offsetParent !== null) {
          candidateButtons.push(button);
        }
      }
    }
  }

  // 尝试查找包含刷新图标的按钮
  if (candidateButtons.length === 0) {
    const refreshIcons = document.querySelectorAll('svg[class*="refresh"], svg[data-icon*="refresh"], .refresh-icon');
    for (let icon of refreshIcons) {
      const button = icon.closest('button');
      if (button && button.offsetParent !== null) {
        candidateButtons.push(button);
      }
    }
  }

  // 去重（基于DOM元素）
  candidateButtons = [...new Set(candidateButtons)];

  // 过滤掉下载按钮和其他非刷新按钮
  let allRefreshButtons = candidateButtons.filter(button => {
    // 检查按钮内容，排除下载按钮
    const buttonHtml = button.innerHTML.toLowerCase();
    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
    const title = (button.getAttribute('title') || '').toLowerCase();

    // 排除包含下载相关内容的按钮
    if (buttonHtml.includes('download') ||
        ariaLabel.includes('download') ||
        title.includes('download')) {
      // console.log('排除下载按钮:', button);
      return false;
    }

    // 检查SVG图标，排除下载图标
    const svgElements = button.querySelectorAll('svg');
    for (let svg of svgElements) {
      const svgClass = svg.className.baseVal || svg.getAttribute('class') || '';
      const svgDataIcon = svg.getAttribute('data-icon') || '';

      if (svgClass.includes('download') || svgDataIcon.includes('download')) {
        // console.log('排除包含下载图标的按钮:', button);
        return false;
      }

      // 检查是否是刷新图标（更精确的匹配）
      if (svgClass.includes('refresh-cw') || svgDataIcon.includes('refresh-cw') ||
          svgClass.includes('refresh') || svgDataIcon.includes('refresh') ||
          svgClass.includes('rotate-cw') || svgDataIcon.includes('rotate-cw')) {
        // console.log('确认包含刷新图标的按钮:', button, 'SVG类名:', svgClass);
        return true;
      }
    }

    // 如果没有明确的图标，检查是否通过其他方式匹配到刷新
    // 如果是通过选择器匹配到的，可能是刷新按钮
    const matchedBySelector = CONFIG.refreshSelectors.some(selector => {
      try {
        return button.matches(selector);
      } catch {
        return false;
      }
    });

    if (matchedBySelector) {
      console.log('通过选择器匹配的按钮，保留:', button);
      return true;
    }

    console.log('未找到明确刷新特征，排除按钮:', button);
    return false;
  });

  // console.log(`找到 ${allRefreshButtons.length} 个刷新按钮`);

  if (allRefreshButtons.length === 0) {
    return null;
  }

  // 根据选择的位置返回对应的按钮
  let targetButton = null;
  let targetIndex = 0;

  switch (selectedPosition) {
    case 'first':
      targetButton = allRefreshButtons[0];
      targetIndex = 0;
      // console.log('选择第一个刷新按钮');
      break;

    case 'last':
      targetButton = allRefreshButtons[allRefreshButtons.length - 1];
      targetIndex = allRefreshButtons.length - 1;
      // console.log('选择最后一个刷新按钮');
      break;

    default:
      targetButton = allRefreshButtons[0];
      targetIndex = 0;
      // console.log('默认选择第一个刷新按钮');
  }

  // 记录点击的按钮序号，用于后续查找对应的下载按钮
  initialState.clickedRefreshButtonIndex = targetIndex;

  // 打印所有候选按钮和过滤结果，帮助调试
  // console.log(`原始找到 ${candidateButtons.length} 个候选按钮，过滤后剩余 ${allRefreshButtons.length} 个刷新按钮`);

  candidateButtons.forEach((btn, index) => {
    const rect = btn.getBoundingClientRect();
    const isRefresh = allRefreshButtons.includes(btn);
    const svgInfo = Array.from(btn.querySelectorAll('svg')).map(svg => {
      return `SVG类名: ${svg.className.baseVal || svg.getAttribute('class') || 'none'}`;
    }).join(', ');

    // console.log(`${index + 1}. ${isRefresh ? '✅保留' : '❌过滤'} 位置: (${rect.left}, ${rect.top}) | ${svgInfo}`);
  });

  // console.log('最终刷新按钮信息:');
  // allRefreshButtons.forEach((btn, index) => {
  //   const rect = btn.getBoundingClientRect();
  //   console.log(`${index + 1}. 位置: (${rect.left}, ${rect.top})`);
  // });

  // if (targetButton) {
  //   const rect = targetButton.getBoundingClientRect();
  //   console.log(`✅ 选择目标按钮: 位置(${rect.left}, ${rect.top})`);
  // }

  return targetButton;
}

// 查找对应的下载按钮（修复版本）
function findDownloadButton() {
  // 首先根据保存的序号重新找到当前的刷新按钮位置
  const currentRefreshButton = findRefreshButtonByIndex(initialState.clickedRefreshButtonIndex);
  if (!currentRefreshButton) {
    console.log('❌ 无法找到当前的刷新按钮位置');
    return null;
  }

  const refreshButtonPosition = currentRefreshButton.getBoundingClientRect();
  // console.log(`重新定位刷新按钮位置: (${refreshButtonPosition.left}, ${refreshButtonPosition.top})`);

  // 找到所有下载按钮
  const allDownloadButtons = [];

  // 通过SVG类名查找所有下载按钮
  const downloadIcons = document.querySelectorAll('svg[class*="download"]');
  for (let icon of downloadIcons) {
    const button = icon.closest('button');
    if (button && button.offsetParent !== null) {
      allDownloadButtons.push(button);
    }
  }

  // 遍历所有按钮查找下载按钮（备选方案）
  const allButtons = document.querySelectorAll('button');
  for (let btn of allButtons) {
    if (btn && btn.offsetParent !== null) {
      const svgElements = btn.querySelectorAll('svg');
      for (let svg of svgElements) {
        const svgClass = svg.className.baseVal || svg.getAttribute('class') || '';
        if (svgClass.includes('download')) {
          allDownloadButtons.push(btn);
        }
      }
    }
  }

  // 去重
  const uniqueDownloadButtons = [...new Set(allDownloadButtons)];

  // console.log(`找到 ${uniqueDownloadButtons.length} 个下载按钮:`);
  // uniqueDownloadButtons.forEach((btn, index) => {
  //   const rect = btn.getBoundingClientRect();
  //   console.log(`${index + 1}. 下载按钮位置: (${rect.left}, ${rect.top})`);
  // });

  // 查找对应的下载按钮：y坐标相等（±5像素容差），x坐标有两种匹配模式
  const targetDownloadButton = uniqueDownloadButtons.find(downloadBtn => {
    const downloadRect = downloadBtn.getBoundingClientRect();

    // y坐标检查（允许5像素误差）
    const yMatch = Math.abs(downloadRect.top - refreshButtonPosition.top) <= 5;

    // x坐标检查：两种情况
    const xDistance = downloadRect.left - refreshButtonPosition.left;

    // 情况1：上次刷新失败，下载按钮在刷新按钮左侧或重叠位置（-1~10像素）
    const failureMatch = xDistance >= -1 && xDistance <= 10;

    // 情况2：上次刷新成功，下载按钮在刷新按钮右侧（10~100像素）
    const successMatch = xDistance >= 10 && xDistance <= 100;

    const xMatch = failureMatch || successMatch;

    // 根据匹配情况提供详细日志
    // if (yMatch && failureMatch) {
    //   console.log(`检查下载按钮 (${downloadRect.left}, ${downloadRect.top}): y匹配=${yMatch}, x距离=${xDistance}, 匹配模式=上次失败范围(-1~10)`);
    // } else if (yMatch && successMatch) {
    //   console.log(`检查下载按钮 (${downloadRect.left}, ${downloadRect.top}): y匹配=${yMatch}, x距离=${xDistance}, 匹配模式=上次成功范围(10~100)`);
    // } else {
    //   console.log(`检查下载按钮 (${downloadRect.left}, ${downloadRect.top}): y匹配=${yMatch}, x距离=${xDistance}, x匹配=${xMatch}`);
    // }

    return yMatch && xMatch;
  });

  if (targetDownloadButton) {
    const targetRect = targetDownloadButton.getBoundingClientRect();
    // console.log(`✅ 找到对应的下载按钮: (${targetRect.left}, ${targetRect.top})`);
    return targetDownloadButton;
  } else {
    // console.log('❌ 未找到对应的下载按钮');
    return null;
  }
}

// 根据序号查找刷新按钮
function findRefreshButtonByIndex(index) {
  if (index === null || index === undefined) return null;

  // 重新获取所有刷新按钮
  const allRefreshButtons = getAllRefreshButtons();

  if (index >= 0 && index < allRefreshButtons.length) {
    return allRefreshButtons[index];
  }

  return null;
}

// 获取所有刷新按钮（辅助函数）
function getAllRefreshButtons() {
  let candidateButtons = [];

  // 尝试所有选择器找到刷新按钮
  for (let selector of CONFIG.refreshSelectors) {
    const buttons = document.querySelectorAll(selector);
    buttons.forEach(btn => {
      if (btn && btn.offsetParent !== null) {
        candidateButtons.push(btn);
      }
    });
  }

  // 如果没找到，尝试通过文本内容查找
  if (candidateButtons.length === 0) {
    const allButtons = document.querySelectorAll('button');
    for (let button of allButtons) {
      const text = button.textContent.toLowerCase();
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const title = (button.getAttribute('title') || '').toLowerCase();

      if (text.includes('refresh') || text.includes('刷新') ||
          ariaLabel.includes('refresh') || title.includes('refresh')) {
        if (button.offsetParent !== null) {
          candidateButtons.push(button);
        }
      }
    }
  }

  // 尝试查找包含刷新图标的按钮
  if (candidateButtons.length === 0) {
    const refreshIcons = document.querySelectorAll('svg[class*="refresh"], svg[data-icon*="refresh"], .refresh-icon');
    for (let icon of refreshIcons) {
      const button = icon.closest('button');
      if (button && button.offsetParent !== null) {
        candidateButtons.push(button);
      }
    }
  }

  // 去重
  candidateButtons = [...new Set(candidateButtons)];

  // 过滤出真正的刷新按钮
  return candidateButtons.filter(button => {
    // 检查按钮内容，排除下载按钮
    const buttonHtml = button.innerHTML.toLowerCase();
    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
    const title = (button.getAttribute('title') || '').toLowerCase();

    // 排除包含下载相关内容的按钮
    if (buttonHtml.includes('download') ||
        ariaLabel.includes('download') ||
        title.includes('download') ||
        ariaLabel.includes('下载') ||
        title.includes('下载')) {
      return false;
    }

    // 检查SVG图标，排除下载图标
    const svgElements = button.querySelectorAll('svg');
    for (let svg of svgElements) {
      const svgClass = svg.className.baseVal || svg.getAttribute('class') || '';
      const svgDataIcon = svg.getAttribute('data-icon') || '';

      if (svgClass.includes('download') || svgDataIcon.includes('download')) {
        return false;
      }

      // 检查是否是刷新图标
      if (svgClass.includes('refresh-cw') || svgDataIcon.includes('refresh-cw') ||
          svgClass.includes('refresh') || svgDataIcon.includes('refresh') ||
          svgClass.includes('rotate-cw') || svgDataIcon.includes('rotate-cw')) {
        return true;
      }
    }

    // 如果没有明确的图标，检查是否通过其他方式匹配到刷新
    const matchedBySelector = CONFIG.refreshSelectors.some(selector => {
      try {
        return button.matches(selector);
      } catch {
        return false;
      }
    });

    return matchedBySelector;
  });
}

// 获取当前刷新按钮数量
function getCurrentRefreshButtonCount() {
  // 直接使用findRefreshButton的逻辑来统计数量，避免CSS选择器问题
  let candidateButtons = [];

  // 尝试所有选择器找到刷新按钮
  for (let selector of CONFIG.refreshSelectors) {
    const buttons = document.querySelectorAll(selector);
    buttons.forEach(btn => {
      if (btn && btn.offsetParent !== null) { // 确保按钮可见
        candidateButtons.push(btn);
      }
    });
  }

  // 去重并过滤（简化版本，只保留刷新按钮）
  candidateButtons = [...new Set(candidateButtons)];

  const refreshButtons = candidateButtons.filter(button => {
    // 排除下载按钮
    const svgElements = button.querySelectorAll('svg');
    for (let svg of svgElements) {
      const svgClass = svg.className.baseVal || svg.getAttribute('class') || '';

      if (svgClass.includes('download')) {
        return false;
      }

      if (svgClass.includes('refresh-cw') || svgClass.includes('refresh')) {
        return true;
      }
    }

    // 如果没有明确的图标，通过选择器匹配
    const matchedBySelector = CONFIG.refreshSelectors.some(selector => {
      try {
        return button.matches(selector);
      } catch {
        return false;
      }
    });

    return matchedBySelector;
  });

  return refreshButtons.length;
}

// 等待刷新完成（分级超时处理）
function waitForRefreshComplete() {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (!loopRunning) {
        clearInterval(checkInterval);
        reject(new Error('循环已停止'));
        return;
      }

      const currentCount = getCurrentRefreshButtonCount();
      const elapsedTime = Date.now() - startTime;
      // console.log(`等待图片生成完成... 当前刷新按钮数量: ${currentCount}, 初始数量: ${initialState.refreshButtonCount}`);

      if (currentCount === initialState.refreshButtonCount) {
        clearInterval(checkInterval);
        console.log('按钮数量已恢复，图片生成步骤完成');
        resolve(true);
        return;
      }

      // 分级超时检查
      if (elapsedTime > CONFIG.longWaitTime) {
        // 长期超时（200秒+）：网站可能有问题，触发页面刷新
        clearInterval(checkInterval);
        console.log('❌ 长期超时（200秒+），网站可能存在问题，触发页面刷新...');

        // 🔥 修复：使用正式的页面刷新函数，确保状态保存
        performPageRefresh('long_timeout');
        return;
      } else if (elapsedTime > CONFIG.maxWaitTime) {
        // 短期超时（60秒+）：继续等待，不处理
        // 仅在每经过maxWaitTime的整数倍时输出一次提示，避免日志过多
        if (Math.floor(elapsedTime / CONFIG.maxWaitTime) !== Math.floor((elapsedTime - CONFIG.checkInterval) / CONFIG.maxWaitTime)) {
          console.log(`⚠️ 短期超时（${Math.round(elapsedTime/1000)}秒），继续等待...`);
        }
      }
    }, CONFIG.checkInterval);
  });
}

// 尝试查找对应的下载按钮（限制次数）
function tryFindDownloadButton() {
  return new Promise((resolve, reject) => {
    let attemptCount = 0;

    const tryOnce = () => {
      attemptCount++;
      // console.log(`🔍 第 ${attemptCount}/${CONFIG.maxDownloadAttempts} 次查找下载按钮`);

      if (!loopRunning) {
        reject(new Error('循环已停止'));
        return;
      }

      const downloadButton = findDownloadButton();
      if (downloadButton) {
        // console.log('✅ 找到对应的下载按钮');
        resolve(downloadButton);
        return;
      }

      // 检查是否已达到最大尝试次数
      if (attemptCount >= CONFIG.maxDownloadAttempts) {
        // console.log(`❌ 已尝试 ${CONFIG.maxDownloadAttempts} 次，未找到下载按钮，判断为刷新失败`);
        reject(new Error('未找到下载按钮'));
        return;
      }

      // 等待一段时间后继续尝试
      console.log(`等待 ${CONFIG.downloadCheckInterval}ms 后进行下一次尝试...`);
      setTimeout(tryOnce, CONFIG.downloadCheckInterval);
    };

    // 立即开始第一次尝试
    tryOnce();
  });
}

// 执行一次完整的刷新-下载流程
async function executeRefreshCycle() {
  try {
    console.log(`🔄 开始第 ${operationCount + 1} 次循环生成图片`);

    // 1. 找到刷新按钮
    const refreshButton = findRefreshButton();
    if (!refreshButton) {
      throw new Error('未找到刷新按钮');
    }

    // 2. 在点击刷新按钮之前，检查是否需要执行页面刷新
    if (shouldPerformPageRefresh()) {
      console.log('🔄 检测到需要页面刷新，先执行页面刷新...');
      // 注意：shouldPerformPageRefresh 现在会直接执行刷新，所以这里不需要再调用
      return 'stop_loop'; // 停止当前循环，等待页面刷新后自动恢复
    }

    // 4. 点击刷新按钮
    refreshButton.click();
    operationCount++;

    // 5. 等待刷新完成
    // console.log('开始图片生成...');
    try {
      await waitForRefreshComplete();
    } catch (error) {
      if (error.message.includes('长期超时')) {
        // 长期超时：网站可能有问题，触发页面刷新
        console.log('❌ 长期超时，网站可能存在问题，触发页面刷新...');

        // 执行页面刷新
        await performPageRefresh('long_timeout');
        return 'stop_loop'; // 停止当前循环，等待页面刷新后自动恢复
      }
      throw error; // 重新抛出其他错误
    }

    // 6. 尝试查找对应的下载按钮（最多尝试3次）
    const downloadButton = await tryFindDownloadButton();

    // 7. 点击下载按钮
    // console.log('✅ 图片生成成功，点击下载按钮');
    downloadButton.click();
    successfulDownloads++; // 增加成功下载计数

    console.log(`✅ 第 ${operationCount} 次图片生成成功，次数进度: ${successfulDownloads}/${CONFIG.maxDownloads}，等待2秒后继续...`);

    return true; // 成功完成一次循环

  } catch (error) {
    // 图片生成失败是正常情况，简化日志输出
    if (error.message.includes('未找到下载按钮')) {
      console.log(`❌ 第 ${operationCount} 次图片生成失败: 未找到下载按钮，等待2秒后继续...`);
    } else {
      console.log(`❌ 第 ${operationCount} 次图片生成失败: ${error.message}`);
    }
    return false; // 失败
  }
}

// 启动自动刷新循环
function startAutoRefresh(maxOperations = CONFIG.maxOperations, maxDownloads = CONFIG.maxDownloads) {
  if (loopRunning) {
    console.log('自动刷新已在运行中');
    return { success: false, error: '已在运行中' };
  }

  console.log(`🚀 启动自动刷新循环，目标位置: ${selectedPosition}`);
  console.log(`停止条件: 最大刷新次数=${maxOperations}, 最大下载数量=${maxDownloads}`);

  // 记录初始状态
  const initialRefreshButton = findRefreshButton();
  if (!initialRefreshButton) {
    return { success: false, error: '未找到刷新按钮' };
  }

  initialState.refreshButtonCount = getCurrentRefreshButtonCount();
  initialState.selectedRefreshButton = initialRefreshButton;
  console.log(`初始状态记录: 刷新按钮数量 = ${initialState.refreshButtonCount}`);

  loopRunning = true;
  operationCount = 0;
  successfulDownloads = 0;
  startTime = Date.now(); // 记录开始时间

  // 启用自动页面刷新功能
  window.autoRefreshEnabled = true;

  // 记录启动时间（用于计算页面刷新间隔）
  const startTimeStamp = Date.now();
  localStorage.setItem('adskip_last_page_refresh', startTimeStamp.toString());
  localStorage.setItem('adskip_auto_refresh_start_time', startTimeStamp.toString());

  // 🔥 新增：初始化会话过期检测变量
  lastOperationTime = startTimeStamp;
  shortIntervalCount = 0;

  // 更新配置中的最大值
  CONFIG.maxOperations = maxOperations;
  CONFIG.maxDownloads = maxDownloads;

  // 开始循环
  const runCycle = async () => {
    if (!loopRunning) return;

    // 检查停止条件
    if (operationCount >= CONFIG.maxOperations) {
      console.log(`✅ 已达到最大图片生成次数 (${CONFIG.maxOperations})，停止循环`);
      stopAutoRefresh('reached_max_operations');
      return;
    }

    if (successfulDownloads >= CONFIG.maxDownloads) {
      console.log(`✅ 已达到最大下载数量 (${CONFIG.maxDownloads})，停止循环`);
      stopAutoRefresh('reached_max_downloads');
      return;
    }

    const result = await executeRefreshCycle();

    if (loopRunning) {
      if (result === true) {
        // console.log('✅ 生成成功，等待2秒后继续下一次...');
        setTimeout(runCycle, 2000);
      } else if (result === 'stop_loop') {
        console.log('🌐 检测到需要页面刷新，停止循环');
        // 不调用stopAutoRefresh，因为页面会刷新
        return;
      } else {
        // 生成失败，等待后重新尝试（日志已在executeRefreshCycle中输出）
        setTimeout(runCycle, 2000);
      }
    }
  };

  // 立即开始第一次循环
  runCycle();

  return { success: true };
}

// 停止自动刷新循环
function stopAutoRefresh(reason = 'manual') {
  if (!loopRunning) {
    console.log('自动刷新未在运行');
    return { success: false, error: '未在运行' };
  }

  console.log(`🛑 停止自动刷新循环，原因: ${getStopReasonText(reason)}`);

  // 停止循环
  loopRunning = false;

  // 禁用自动页面刷新功能
  window.autoRefreshEnabled = false;

  // 清理定时器
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  // 计算运行时间和统计信息
  const endTime = Date.now();
  const totalTime = startTime ? endTime - startTime : 0;
  const totalMinutes = Math.floor(totalTime / 60000);
  const totalSeconds = Math.floor((totalTime % 60000) / 1000);

  // 生成报告
  const report = {
    reason: reason,
    totalTime: totalTime,
    totalTimeFormatted: `${totalMinutes}分${totalSeconds}秒`,
    operationCount: operationCount,
    successfulDownloads: successfulDownloads,
    successRate: operationCount > 0 ? Math.round((successfulDownloads / operationCount) * 100) : 0
  };

  console.log('📊 运行报告:', report);

  // 发送停止消息给popup
  chrome.runtime.sendMessage({
    action: 'loopStopped',
    report: report
  }).catch(() => {}); // popup可能已关闭，忽略错误

  // 重置状态
  startTime = null;
  operationCount = 0;
  successfulDownloads = 0;

  // 🔥 新增：重置会话过期检测变量
  lastOperationTime = null;
  shortIntervalCount = 0;

  return { success: true, report: report };
}

// 检查是否需要执行页面刷新
function shouldPerformPageRefresh() {
  // 检查是否启用了自动刷新
  if (!window.autoRefreshEnabled) {
    return false;
  }

  // 🔥 新增：检测会话是否过期（连续3次间隔小于5秒）
  if (shouldRefreshDueToSessionExpiry()) {
    console.log('🔄 检测到会话过期（连续3次短间隔），需要页面刷新');
    // 直接在这里调用，传入正确的刷新原因
    performPageRefresh('session_expiry');
    return true;
  }

  // 检查距离上次页面刷新的时间
  const lastRefreshTimeStr = localStorage.getItem('adskip_last_page_refresh');
  if (!lastRefreshTimeStr) {
    return false;
  }

  const now = Date.now();
  const timeSinceLastRefresh = now - parseInt(lastRefreshTimeStr);

  // 使用配置中的刷新间隔，每10分钟刷新一次
  const refreshInterval = REFRESH_INTERVAL_CONFIG; // 5分钟（测试用，生产环境改为30*60*1000）

  // 🔥 修复：实现真正的"每5分钟刷新一次"逻辑
  // 计算从启动时间开始，当前应该在第几个5分钟周期
  const startTime = localStorage.getItem('adskip_auto_refresh_start_time');
  if (!startTime) {
    // 如果没有启动时间记录，使用距离上次刷新的时间判断
    console.log('🔄 页面刷新检查: 无启动时间记录，使用距离上次刷新时间判断');
    return timeSinceLastRefresh >= refreshInterval;
  }

  const elapsedTime = now - parseInt(startTime);
  const currentPeriod = Math.floor(elapsedTime / refreshInterval);

  // 🔥 修复：使用距离上次刷新的时间来计算上次刷新周期
  // 这样即使页面刷新后，也能正确计算周期
  const lastRefreshTime = parseInt(lastRefreshTimeStr);
  const lastRefreshPeriod = Math.floor((lastRefreshTime - parseInt(startTime)) / refreshInterval);

  // console.log(`🔄 页面刷新检查: 启动时间=${new Date(parseInt(startTime)).toLocaleTimeString()}, 当前时间=${new Date(now).toLocaleTimeString()}`);
  // console.log(`🔄 页面刷新检查: 已运行${Math.round(elapsedTime/1000)}秒, 当前周期=${currentPeriod}, 上次刷新周期=${lastRefreshPeriod}`);
  // console.log(`🔄 页面刷新检查: 上次刷新时间=${new Date(lastRefreshTime).toLocaleTimeString()}`);

  // 如果当前周期数大于上次刷新的周期数，说明需要刷新
  // 这样可以确保每5分钟都刷新一次，而不是只在超过5分钟时刷新
  const shouldRefresh = currentPeriod > lastRefreshPeriod;
  // console.log(`🔄 页面刷新检查: 需要刷新=${shouldRefresh}`);

  if (shouldRefresh) {
    // 直接在这里调用，传入正确的刷新原因
    performPageRefresh('timer');
  }

  return shouldRefresh;
}

// 🔥 新增：检测会话是否过期的函数
function shouldRefreshDueToSessionExpiry() {
  if (!lastOperationTime) {
    return false;
  }

  const now = Date.now();
  const interval = now - lastOperationTime;

  // 如果间隔小于阈值，增加计数
  if (interval < SHORT_INTERVAL_THRESHOLD) {
    shortIntervalCount++;
    console.log(`🔄 会话过期检测: 间隔${Math.round(interval/1000)}秒 < ${SHORT_INTERVAL_THRESHOLD/1000}秒，短间隔计数: ${shortIntervalCount}/${MAX_SHORT_INTERVALS}`);
  } else {
    // 如果间隔正常，重置计数
    shortIntervalCount = 0;
    // console.log(`🔄 会话过期检测: 间隔${Math.round(interval/1000)}秒 >= ${SHORT_INTERVAL_THRESHOLD/1000}秒，重置短间隔计数`);
  }

  // 更新上次操作时间
  lastOperationTime = now;

  // 如果连续3次都是短间隔，认为会话过期
  return shortIntervalCount >= MAX_SHORT_INTERVALS;
}

// 🔥 新增：检测页面加载类型的函数
function detectPageLoadType() {
  const refreshInfo = localStorage.getItem('adskip_refresh_info');
  const autoRefreshState = localStorage.getItem('adskip_auto_refresh_state');

  if (refreshInfo && autoRefreshState) {
    try {
      const info = JSON.parse(refreshInfo);
      const state = JSON.parse(autoRefreshState);

      console.log(`🔄 页面加载类型检测:`);
      console.log(`  - 刷新类型: ${info.type}`);
      console.log(`  - 刷新原因: ${info.reason}`);
      console.log(`  - 刷新时间: ${new Date(info.timestamp).toLocaleString()}`);
      console.log(`  - 状态保存: 是`);

      // 标记这是自动刷新后的页面加载
      window.isAutoRefreshPage = true;

    } catch (error) {
      console.error('❌ 解析刷新信息失败:', error);
    }
  } else if (performance.navigation.type === 1) {
    // 页面刷新（F5或Ctrl+R）
    console.log('🔄 页面加载类型检测: 手动刷新');
    window.isAutoRefreshPage = false;
  } else if (performance.navigation.type === 0) {
    // 正常导航
    console.log('🔄 页面加载类型检测: 正常导航');
    window.isAutoRefreshPage = false;
  } else {
    // 其他情况（可能是Cloudflare验证后的返回）
    console.log('🔄 页面加载类型检测: 其他情况（可能是Cloudflare验证）');
    window.isAutoRefreshPage = false;
  }
}

// 🔥 新增：检测是否在Cloudflare验证页面
function isCloudflareVerificationPage() {
  // 🔥 修复：正确的Cloudflare检测逻辑
  // Cloudflare验证页面特征：/c/路径 + 验证元素，但不包含__cf_chl_tk参数
  const url = window.location.href;
  const hasCfPath = url.includes('/c/');
  const hasCfToken = url.includes('__cf_chl_tk=');

  // 通过页面元素检测（这是最可靠的检测方式）
  const hasCfCheckbox = document.querySelector('input[type="checkbox"][class*="cb"]');
  const hasCfLabel = document.querySelector('label[class*="cb-lb"]');
  const hasCfText = document.querySelector('span[class*="cb-lb-t"]');

  // 通过页面内容检测
  const hasVerifyText = document.body.textContent.includes('Verify you are human');

  // 🔥 修复：Cloudflare验证页面的正确判断
  // 1. 必须有/c/路径
  // 2. 必须有验证元素
  // 3. 不能有__cf_chl_tk参数（有的话说明验证已完成）
  const isCfPage = hasCfPath && (hasCfCheckbox || hasVerifyText) && !hasCfToken;

  if (isCfPage) {
    addLogEntry('warn', 'cloudflare', `进入Cloudflare验证页面 - 验证路径检测`, {
      url: url,
      hasCfPath: hasCfPath,
      hasCfToken: hasCfToken,
      hasCfCheckbox: !!hasCfCheckbox,
      hasVerifyText: hasVerifyText,
      detectionTime: new Date().toLocaleString(),
      currentOperationCount: operationCount || 0,
      currentSuccessfulDownloads: successfulDownloads || 0
    });
  }

  return isCfPage;
}

// 🔥 新增：自动勾选Cloudflare复选框
function attemptAutoCheckCloudflare() {
  console.log('🔄 尝试自动勾选Cloudflare复选框...');

  // 🔥 修复：更精确的复选框查找
  // 查找包含"Verify you are human"文本的复选框
  const checkbox = document.querySelector('input[type="checkbox"][class*="cb"]');
  if (!checkbox) {
    console.log('❌ 未找到Cloudflare复选框');
    return false;
  }

  console.log('✅ 找到Cloudflare复选框，尝试自动勾选...');

  // 检查复选框是否已经被勾选
  if (checkbox.checked) {
    console.log('✅ 复选框已经被勾选，无需操作');
    return true;
  }

  try {
    // 🔥 修复：更真实的勾选操作
    // 1. 先点击label，这是更自然的用户行为
    const label = checkbox.closest('label[class*="cb-lb"]');
    if (label) {
      label.click();
      console.log('✅ 点击label触发复选框勾选');
    }

    // 2. 确保复选框状态为checked
    checkbox.checked = true;

    // 3. 触发change事件，确保Cloudflare检测到勾选
    const changeEvent = new Event('change', { bubbles: true });
    checkbox.dispatchEvent(changeEvent);

    // 4. 触发input事件，模拟真实的用户输入
    const inputEvent = new Event('input', { bubbles: true });
    checkbox.dispatchEvent(inputEvent);

    console.log('✅ 成功自动勾选Cloudflare复选框');

    // 记录日志
    addLogEntry('success', 'cloudflare', '自动勾选Cloudflare复选框成功', {
      checkboxFound: true,
      wasChecked: false,
      autoCheckTime: new Date().toLocaleString(),
      method: 'label_click_and_events'
    });

    // 🔥 修复：更频繁的状态检查
    setTimeout(() => {
      checkCloudflareVerificationStatus();
    }, 1000);

    return true;

  } catch (error) {
    console.error('❌ 自动勾选Cloudflare复选框失败:', error);

    // 记录错误日志
    addLogEntry('error', 'cloudflare', '自动勾选Cloudflare复选框失败', {
      error: error.message,
      checkboxFound: true,
      wasChecked: false
    });

    return false;
  }
}

// 🔥 新增：检查Cloudflare验证状态
function checkCloudflareVerificationStatus() {
  // 检查是否还在Cloudflare验证页面
  if (!isCloudflareVerificationPage()) {
    console.log('✅ Cloudflare验证已完成，页面已跳转');

    // 🔥 修复：验证完成后立即尝试恢复状态
    setTimeout(() => {
      console.log('🔄 Cloudflare验证完成，尝试恢复自动刷新状态...');
      checkAndRestoreAutoRefreshState();
    }, 1000);

    return;
  }

  // 检查复选框状态
  const checkbox = document.querySelector('input[type="checkbox"][class*="cb"]');
  if (checkbox && checkbox.checked) {
    console.log('✅ 复选框已勾选，等待验证完成...');

    // 🔥 修复：更频繁的检查，确保及时检测到验证完成
    setTimeout(() => {
      checkCloudflareVerificationStatus();
    }, 500);
  } else {
    console.log('⚠️ 复选框状态异常，可能需要手动操作');

    // 🔥 修复：如果复选框状态异常，也继续检查
    setTimeout(() => {
      checkCloudflareVerificationStatus();
    }, 1000);
  }
}

// 🔥 新增：启用Cloudflare保护模式
function enableCloudflareProtectionMode() {
  console.log('🔄 启用Cloudflare保护模式，保护自动刷新状态');

  // 标记当前页面状态
  window.isCloudflarePage = true;

  // 🔥 新增：尝试自动勾选Cloudflare复选框
  attemptAutoCheckCloudflare();

  // 检查是否有需要保护的自动刷新状态
  const autoRefreshState = localStorage.getItem('adskip_auto_refresh_state');
  if (autoRefreshState) {
    console.log('💾 检测到需要保护的自动刷新状态，启用状态保护');

    // 设置状态保护标记
    localStorage.setItem('adskip_cf_protection_active', 'true');
    localStorage.setItem('adskip_cf_protection_time', Date.now().toString());

    // 监听页面变化，检测验证完成
    setupCloudflareCompletionDetection();
  } else {
    console.log('💾 无需保护的自动刷新状态');
  }
}

// 🔥 新增：设置Cloudflare完成检测
function setupCloudflareCompletionDetection() {
  console.log('🔄 设置Cloudflare验证完成检测...');

  // 监听URL变化
  let lastUrl = window.location.href;
  const urlCheckInterval = setInterval(() => {
    const currentUrl = window.location.href;

    if (currentUrl !== lastUrl) {
      console.log('🔄 检测到URL变化，可能是Cloudflare验证完成');
      lastUrl = currentUrl;

                      // 🔥 修复：改进URL变化检测逻辑
        // 检查是否从Cloudflare验证页面跳转到了正常页面
        if (currentUrl.includes('lmarena.ai') && !isCloudflareVerificationPage()) {
          // 检查是否是从验证页面跳转过来的
          const wasFromVerification = lastUrl.includes('/c/') && !lastUrl.includes('__cf_chl_tk=');

          if (wasFromVerification) {
            console.log('✅ Cloudflare验证完成，从验证页面跳转到正常页面');

            // 🔥 新增：记录Cloudflare验证完成日志
            addLogEntry('success', 'cloudflare', `Cloudflare验证完成，从验证页面跳转到正常页面`, {
              fromUrl: lastUrl,
              toUrl: currentUrl,
              completionTime: new Date().toLocaleString(),
              verificationDuration: Math.round((Date.now() - parseInt(localStorage.getItem('adskip_cf_protection_time') || Date.now())) / 1000) + '秒',
              jumpType: 'verification_to_normal'
            });

            clearInterval(urlCheckInterval);

            // 🔥 修复：立即尝试恢复状态，不延迟
            console.log('🔄 Cloudflare验证完成，立即尝试恢复自动刷新状态...');
            checkAndRestoreAutoRefreshState();
          }
        }
    }
  }, 1000);

  // 监听页面元素变化
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // 检查是否还有Cloudflare验证元素
        if (!isCloudflareVerificationPage()) {
          console.log('✅ 检测到Cloudflare验证元素消失，验证可能完成');
          observer.disconnect();

          // 延迟恢复自动刷新状态
          setTimeout(() => {
            console.log('🔄 延迟恢复自动刷新状态...');
            checkAndRestoreAutoRefreshState();
          }, 2000);

          break;
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 🔥 新增：日志系统核心函数
function addLogEntry(level, category, message, data = null) {
  try {
    const logEntry = {
      timestamp: Date.now(),
      level: level, // 'info', 'warn', 'error', 'success'
      category: category, // 'refresh', 'cloudflare', 'session', 'operation'
      message: message,
      data: data,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    // 获取现有日志
    let logs = JSON.parse(localStorage.getItem('adskip_logs') || '[]');

    // 添加新日志
    logs.push(logEntry);

    // 限制日志数量
    if (logs.length > LOG_MAX_ENTRIES) {
      logs = logs.slice(-LOG_MAX_ENTRIES);
    }

    // 清理过期日志
    const now = Date.now();
    logs = logs.filter(log => (now - log.timestamp) < LOG_ENTRY_TTL);

    // 保存日志
    localStorage.setItem('adskip_logs', JSON.stringify(logs));

    // 同时输出到控制台（保持原有行为）
    const consoleMethod = level === 'error' ? 'error' :
                          level === 'warn' ? 'warn' :
                          level === 'success' ? 'log' : 'log';

    const emoji = level === 'error' ? '❌' :
                  level === 'warn' ? '⚠️' :
                  level === 'success' ? '✅' : '🔄';

    console[consoleMethod](`${emoji} [${category.toUpperCase()}] ${message}`, data || '');

  } catch (error) {
    console.error('❌ 添加日志失败:', error);
  }
}

// 🔥 新增：获取日志
function getLogs(category = null, level = null, limit = null) {
  try {
    let logs = JSON.parse(localStorage.getItem('adskip_logs') || '[]');

    // 按类别过滤
    if (category) {
      logs = logs.filter(log => log.category === category);
    }

    // 按级别过滤
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    // 限制数量
    if (limit) {
      logs = logs.slice(-limit);
    }

    return logs;
  } catch (error) {
    console.error('❌ 获取日志失败:', error);
    return [];
  }
}

// 🔥 新增：清理日志
function clearLogs() {
  try {
    localStorage.removeItem('adskip_logs');
    console.log('✅ 日志已清理');
    return { success: true };
  } catch (error) {
    console.error('❌ 清理日志失败:', error);
    return { success: false, error: error.message };
  }
}

// 🔥 新增：导出日志
function exportLogs() {
  try {
    const logs = getLogs();
    const logText = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleString();
      const level = log.level.toUpperCase().padEnd(5);
      const category = log.category.toUpperCase().padEnd(10);
      return `[${time}] ${level} [${category}] ${log.message}`;
    }).join('\n');

    // 创建下载链接
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adskip_logs_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    return { success: true, count: logs.length };
  } catch (error) {
    console.error('❌ 导出日志失败:', error);
    return { success: false, error: error.message };
  }
}

// 执行页面刷新（避免Cloudflare会话过期）
async function performPageRefresh(reason = 'unknown') {
  // console.log('🔄 执行页面刷新，避免Cloudflare会话过期...');

  try {
    // 记录当前刷新时间
    localStorage.setItem('adskip_last_page_refresh', Date.now().toString());

    // 🔥 新增：标记刷新类型和状态
    const refreshInfo = {
      type: 'auto_refresh', // 自动刷新
      timestamp: Date.now(),
      reason: reason // 具体的刷新原因
    };
    localStorage.setItem('adskip_refresh_info', JSON.stringify(refreshInfo));

    // 🔥 新增：记录刷新前状态日志
    addLogEntry('info', 'refresh', `页面刷新前状态 - 已完成${operationCount}次生成，${successfulDownloads}次下载`, {
      operationCount: operationCount,
      successfulDownloads: successfulDownloads,
      selectedPosition: selectedPosition,
      maxOperations: CONFIG.maxOperations,
      maxDownloads: CONFIG.maxDownloads,
      reason: refreshInfo.reason,
      currentTime: new Date().toLocaleString(),
      url: window.location.href
    });

    // 保存当前状态
    const currentState = {
      isRunning: loopRunning,
      operationCount: operationCount,
      successfulDownloads: successfulDownloads,
      selectedPosition: selectedPosition,
      maxOperations: CONFIG.maxOperations,
      maxDownloads: CONFIG.maxDownloads,
      startTime: startTime,
      autoStart: true, // 页面刷新后自动恢复
      // 保存初始状态信息（重要：用于恢复后继续执行）
      refreshButtonCount: initialState.refreshButtonCount,
      clickedRefreshButtonIndex: initialState.clickedRefreshButtonIndex,
      // 🔥 新增：保存刷新信息
      refreshInfo: refreshInfo
    };

    console.log('💾 保存当前状态:', currentState);

    // 保存到localStorage（页面刷新后仍可访问）
    localStorage.setItem('adskip_auto_refresh_state', JSON.stringify(currentState));

    // console.log('💾 已保存当前状态，准备刷新页面...');

    // 延迟刷新，让用户看到状态
    setTimeout(() => {
      location.reload();
    }, 1000);

    return { success: true, message: '页面将在1秒后刷新' };

  } catch (error) {
    console.error('❌ 页面刷新失败:', error);
    addLogEntry('error', 'refresh', '页面刷新失败', { error: error.message });
    return { success: false, error: error.message };
  }
}

// 执行自动刷新（避免Cloudflare会话过期）
function performAutoRefresh() {
  console.log('🔄 执行自动刷新，避免Cloudflare会话过期...');

  try {
    // 从popup获取autoStart设置
    chrome.runtime.sendMessage({action: 'getAutoStartSetting'}, function(response) {
      if (chrome.runtime.lastError) {
        console.log('无法获取autoStart设置，使用默认值false');
      }

      // 保存当前状态
      const currentState = {
        isRunning: loopRunning, // 修复：使用正确的变量名
        operationCount: operationCount,
        successfulDownloads: successfulDownloads,
        selectedPosition: selectedPosition,
        maxOperations: CONFIG.maxOperations,
        maxDownloads: CONFIG.maxDownloads,
        startTime: startTime,
        autoStart: response ? response.autoStart : false
      };

      // 保存到localStorage（页面刷新后仍可访问）
      localStorage.setItem('adskip_auto_refresh_state', JSON.stringify(currentState));

      console.log('💾 已保存当前状态，准备刷新页面...');

      // 延迟刷新，让用户看到状态
      setTimeout(() => {
        location.reload();
      }, 1000);
    });

    return { success: true, message: '页面将在1秒后刷新' };

  } catch (error) {
    console.error('❌ 自动刷新失败:', error);
    return { success: false, error: error.message };
  }
}

// 检查并恢复自动刷新状态
function checkAndRestoreAutoRefreshState() {
  try {
    const savedState = localStorage.getItem('adskip_auto_refresh_state');
    if (savedState) {
      const state = JSON.parse(savedState);
      console.log('🔄 检测到自动刷新状态，准备恢复...', state);

      // 🔥 新增：检查刷新类型和状态
      // const refreshInfo = state.refreshInfo || {};
      // console.log(`🔄 刷新类型: ${refreshInfo.type}, 原因: ${refreshInfo.reason}`);

      // 🔥 新增：检查是否在Cloudflare保护模式下
      const cfProtectionActive = localStorage.getItem('adskip_cf_protection_active');
      if (cfProtectionActive) {
        console.log('🔄 检测到Cloudflare保护模式，延迟状态恢复...');

        // 在保护模式下，给更多时间让Cloudflare验证完成
        setTimeout(() => {
          console.log('🔄 Cloudflare保护模式下恢复状态...');
          restoreAutoRefreshState(state);
        }, 5000); // 延迟5秒
      } else {
        // 正常恢复
        setTimeout(() => {
          restoreAutoRefreshState(state);
        }, 3000);
      }
    }
  } catch (error) {
    console.error('❌ 检查自动刷新状态失败:', error);
  }
}

// 恢复自动刷新状态
function restoreAutoRefreshState(state) {
  try {
    // console.log('🔄 恢复自动刷新状态...');

    // 🔥 新增：记录状态恢复日志
    addLogEntry('success', 'refresh', `页面刷新后状态恢复 - 恢复${state.operationCount}次生成，${state.successfulDownloads}次下载`, {
      operationCount: state.operationCount,
      successfulDownloads: state.successfulDownloads,
      selectedPosition: state.selectedPosition,
      maxOperations: state.maxOperations,
      maxDownloads: state.maxDownloads,
      refreshInfo: state.refreshInfo,
      recoveryTime: new Date().toLocaleString(),
      url: window.location.href
    });

    // 恢复配置
    CONFIG.maxOperations = state.maxOperations;
    CONFIG.maxDownloads = state.maxDownloads;
    selectedPosition = selectedPosition;

    // 恢复执行状态
    operationCount = state.operationCount || 0;
    successfulDownloads = state.successfulDownloads || 0;
    startTime = state.startTime || Date.now();

    // 🔥 修复：恢复自动刷新功能
    window.autoRefreshEnabled = true;

    // 🔥 新增：重置会话过期检测变量
    lastOperationTime = Date.now();
    shortIntervalCount = 0;

    // 恢复初始状态（重要：用于判断图片生成完成）
    initialState.refreshButtonCount = state.refreshButtonCount || 0;
    initialState.selectedRefreshButton = null; // 重新查找
    initialState.clickedRefreshButtonIndex = state.clickedRefreshButtonIndex || 0;

    // console.log(`📊 恢复初始状态: 刷新按钮数量 = ${initialState.refreshButtonCount}`);

    // 如果之前在运行或者启用了自动启动，自动开始执行
    if (state.isRunning || state.autoStart) {
      // const reason = state.isRunning ? '之前正在运行' : '启用了自动启动';
      // console.log(`🔄 检测到${reason}，自动开始执行...`);
      // console.log(`📊 恢复状态: 已完成${operationCount}次，成功下载${successfulDownloads}次`);
      // console.log(`📊 剩余执行: 还需${CONFIG.maxOperations - operationCount}次生成，还需${CONFIG.maxDownloads - successfulDownloads}次下载`);

      // 等待页面元素加载完成
      setTimeout(() => {
        // 检查是否还需要继续执行
        if (operationCount >= CONFIG.maxOperations || successfulDownloads >= CONFIG.maxDownloads) {
          console.log('✅ 已达到停止条件，无需继续执行');
          // 通知popup更新状态
          chrome.runtime.sendMessage({
            action: 'autoRefreshRestored',
            state: {
              ...state,
              operationCount: operationCount,
              successfulDownloads: successfulDownloads
            }
          }).catch(() => {});
          return;
        }

        // 继续执行，但不要重新调用startAutoRefresh，而是直接开始循环
        // console.log('🔄 继续执行剩余任务...');
        loopRunning = true;

        // 直接开始循环，跳过startAutoRefresh的初始化
        const runCycle = async () => {
          if (!loopRunning) return;

          // 检查停止条件
          if (operationCount >= CONFIG.maxOperations) {
            console.log(`✅ 已达到图片生成次数上限 (${CONFIG.maxOperations})，停止循环`);
            stopAutoRefresh('reached_max_operations');
            return;
          }

          if (successfulDownloads >= CONFIG.maxDownloads) {
            console.log(`✅ 已达到成功生成次数上限 (${CONFIG.maxDownloads})，停止循环`);
            stopAutoRefresh('reached_max_downloads');
            return;
          }

          const result = await executeRefreshCycle();

          if (loopRunning) {
            if (result === true) {
              // console.log('✅ 生成成功，等待2秒后继续下一次...');
              setTimeout(runCycle, 2000);
            } else if (result === 'stop_loop') {
              console.log('🌐 检测到需要页面刷新，停止循环');
              return;
            } else {
              // console.log('❌ 生成失败，等待2秒后重新尝试...');
              setTimeout(runCycle, 2000);
            }
          }
        };

        // 立即开始循环
        runCycle();

        // 通知popup更新状态
        chrome.runtime.sendMessage({
          action: 'autoRefreshRestored',
          state: {
            ...state,
            operationCount: operationCount,
            successfulDownloads: successfulDownloads
          }
        }).catch(() => {});

        // 🔥 新增：延迟清理状态，给Cloudflare验证留时间
        // 只有在成功恢复后才清理，避免Cloudflare验证过程中丢失状态
        setTimeout(() => {
          console.log('💾 状态恢复成功，清理保存的状态');
          localStorage.removeItem('adskip_auto_refresh_state');
          localStorage.removeItem('adskip_refresh_info');
        }, 10000); // 延迟10秒清理

      }, 2000);
    } else {
      // 🔥 新增：如果没有自动恢复，也延迟清理状态
      // 这可能是Cloudflare验证的情况，给更多时间
      setTimeout(() => {
        console.log('💾 未检测到自动恢复，延迟清理保存的状态（可能是Cloudflare验证）');
        localStorage.removeItem('adskip_auto_refresh_state');
        localStorage.removeItem('adskip_refresh_info');
      }, 30000); // 延迟30秒清理
    }

  } catch (error) {
    console.error('❌ 恢复自动刷新状态失败:', error);
  }
}

// 检查是否需要自动启动
function checkAutoStart() {
  // console.log('🔍 检查是否启用了自动启动...');

  // 直接从chrome.storage.local获取设置
  chrome.storage.local.get(['autoStart', 'maxOperations', 'maxDownloads', 'position'], function(settings) {
    if (settings.autoStart) {
      // console.log('✅ 检测到autoStart=true，准备自动循环生成图片...');

      const maxOperations = settings.maxOperations || 100;
      const maxDownloads = settings.maxDownloads || 50;
      const position = settings.position || 'first';

      // console.log('📋 使用设置开始循环生成图片:', { maxOperations, maxDownloads, position });
      selectedPosition = position;

      // 等待页面加载完成后自动启动
      setTimeout(() => {
        // console.log('🚀 开始自动启动...');
        const result = startAutoRefresh(maxOperations, maxDownloads);
        if (result.success) {
          // console.log('✅ 自动启动循环生成图片成功');
        } else {
          console.log('❌ 自动启动循环生成图片失败:', result.error);
        }
      }, 3000);
    } else {
      console.log('💡 autoStart=false，不自动循环生成图片');
    }
  });
}

// 获取停止原因的中文描述
function getStopReasonText(reason) {
  switch (reason) {
    case 'manual': return '手动停止';
    case 'reached_max_operations': return '达到最大循环次数';
    case 'reached_max_downloads': return '达到最大下载数量';
    case 'website_problem': return '网站问题（200秒超时）';
    case 'error': return '发生错误';
    default: return '未知原因';
  }
}

// 创建插件分析组件（为特定容器定制）
function createPluginComponent(containerId, side) {
  const component = document.createElement('div');
  component.className = 'adskip-plugin-component';
  component.setAttribute('data-container-id', containerId);

  component.innerHTML = `
    <div style="
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-left: 12px;
      padding: 4px 8px;
      background: #f0f9ff;
      border: 1px solid #0ea5e9;
      border-radius: 6px;
      font-size: 12px;
      color: #0369a1;
      font-family: Arial, sans-serif;
    ">
      <span>图片格式:</span>
      <span class="adskip-status" data-side="${side}">处理中...</span>
    </div>
  `;
  return component;
}

// 注入插件组件到标题区域
function injectPluginComponent() {
  // 查找标题容器（包含 "Assistant A" 的容器）
  const titleSelector = 'div.flex.min-w-0.flex-1.items-center.gap-2';
  const titleContainers = document.querySelectorAll(titleSelector);

  // console.log(`🔍 找到 ${titleContainers.length} 个标题容器`);

  if (titleContainers.length === 0) {
    // console.log('❌ 未找到标题容器');
    return false;
  }

  let injectedCount = 0;

  // 为每个标题容器添加分析组件
  titleContainers.forEach((container, index) => {
    // 检查是否包含 "Assistant" 文本
    const titleText = container.textContent || '';
    if (titleText.includes('Assistant') && !container.querySelector('.adskip-plugin-component')) {
      const containerId = `container-${Date.now()}-${index}`;
      // console.log(`✅ 为标题容器 ${index + 1} (${titleText.trim()}) 添加分析组件，ID: ${containerId}`);
      let side = "right";
      if (titleText.includes('Assistant A')) {
        side = "left";
      }
      const pluginComponent = createPluginComponent(containerId, side);
      container.appendChild(pluginComponent);
      injectedCount++;

      // 开始分析这个容器的图片
      analyzeContainerImages(container, containerId);
    } else if (titleText.includes('Assistant') && container.querySelector('.adskip-plugin-component')) {
      // console.log(`⚠️ 标题容器 ${index + 1} 已存在组件，跳过`);
    }
  });

  // if (injectedCount > 0) {
  //   console.log(`📊 本次注入完成，新增 ${injectedCount} 个组件`);
  // }
  return injectedCount > 0;
}

// 设置持续监听，确保组件常驻
function setupComponentPersistence() {
  // console.log('🔧 设置组件持久化监听...');

  // 创建MutationObserver监听DOM变化
  const observer = new MutationObserver((mutations) => {
    let shouldReinject = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // 检查是否有我们的组件被移除
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE &&
              (node.classList?.contains('adskip-plugin-component') ||
               node.querySelector?.('.adskip-plugin-component'))) {
            // console.log('⚠️ 检测到插件组件被移除，准备重新注入');
            shouldReinject = true;
            break;
          }
        }

        // 检查是否有新的标题容器出现
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE &&
              (node.matches?.('div.flex.min-w-0.flex-1.items-center.gap-2') ||
               node.querySelector?.('div.flex.min-w-0.flex-1.items-center.gap-2'))) {
            console.log('🆕 检测到新的标题容器，准备注入组件');
            shouldReinject = true;
            break;
          }
        }
      }
    }

    // 如果需要重新注入，延迟执行避免频繁操作
    if (shouldReinject) {
      setTimeout(() => {
        // console.log('🔄 执行组件重新注入...');
        injectPluginComponent();
      }, 100);
    }
  });

  // 开始监听
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // console.log('✅ 组件持久化监听已启动');
  return observer;
}

// 设置刷新按钮监听，用于重新分析图片
function setupRefreshButtonListener() {
  // console.log('🔧 设置刷新按钮监听...');

  // 监听页面上的点击事件
  document.addEventListener('click', (event) => {
    // 检查点击的是否是刷新按钮
    const clickedElement = event.target;
    const refreshButton = clickedElement.closest('button[data-sentry-element="TooltipTrigger"]');

    if (refreshButton) {
      // 进一步检查：只有刷新按钮才触发，不是下载按钮
      // 刷新按钮通常在标题栏区域，下载按钮在图片区域
      const isInTitleArea = refreshButton.closest('div.bg-surface-primary.border-border-faint\\/50.sticky.top-0');

      if (isInTitleArea) {
        // console.log('🔄 检测到刷新按钮点击，准备重新分析图片...');

        // 找到对应的容器，只重新分析这个容器
        const containerDiv = refreshButton.closest('div.flex.min-w-0.flex-col.gap-2.lg\\:flex-row.lg\\:gap-3 > div');
        if (containerDiv) {
          const titleContainer = containerDiv.querySelector('div.flex.min-w-0.flex-1.items-center.gap-2');
          const pluginComponent = titleContainer?.querySelector('.adskip-plugin-component');

          if (pluginComponent) {
            const containerId = pluginComponent.getAttribute('data-container-id');

            // 重置状态 - 根据标题确定左右
            const titleSpan = titleContainer?.querySelector('span.truncate');
            const titleText = titleSpan ? titleSpan.textContent.trim() : '';
            const side = titleText === 'Assistant A' ? 'left' : 'right';
            // console.log(`🔄 重新分析${side}侧容器: ${containerId}`);
            updateComponentStatus(containerId, side, '重新分析中...');

            // 延迟分析
            setTimeout(() => {
              analyzeContainerImages(titleContainer, containerId);
            }, 2000);
          }
        }
      } else {
        console.log('🚫 跳过下载按钮点击');
      }
    }
  });

  // console.log('✅ 刷新按钮监听已启动');
}

// 重新分析所有容器的图片
function reanalyzeAllContainers() {
  const pluginComponents = document.querySelectorAll('.adskip-plugin-component');
  console.log(`🔍 找到 ${pluginComponents.length} 个插件组件，开始重新分析...`);

  pluginComponents.forEach((component, index) => {
    const containerId = component.getAttribute('data-container-id');
    if (containerId) {
      console.log(`🔄 重新分析容器 ${index + 1}: ${containerId}`);

      // 找到对应的标题容器
      const titleContainer = component.closest('div.flex.min-w-0.flex-1.items-center.gap-2');

      // 根据标题确定左右，先重置状态为"重新分析中"
      const titleSpan = titleContainer?.querySelector('span.truncate');
      const titleText = titleSpan ? titleSpan.textContent.trim() : '';
      const side = titleText === 'Assistant A' ? 'left' : 'right';
      updateComponentStatus(containerId, side, '重新分析中...');
      if (titleContainer) {
        // 延迟分析，避免图片还没开始加载
        setTimeout(() => {
          analyzeContainerImages(titleContainer, containerId);
        }, 1000 * (index + 1)); // 错开时间，避免同时分析
      }
    }
  });
}

// 分析容器对应的图片信息
function analyzeContainerImages(container, containerId) {
  // console.log(`🔍 开始分析容器 ${containerId} 对应的图片...`);

  let side = "right";
  const titleSpan = container.querySelector('span.truncate');
  const titleText = titleSpan ? titleSpan.textContent.trim() : '';
  if (titleText === "Assistant A") {
    side = "left";
  }

  // 从标题容器向上找到完整的对话容器
  // 结构: div.flex.min-w-0.flex-col.gap-2.lg:flex-row.lg:gap-3 > div > [标题区域 + 内容区域]
  const dialogContainer = container.closest('div.flex.min-w-0.flex-col.gap-2.lg\\:flex-row.lg\\:gap-3 > div');

  if (!dialogContainer) {
    console.log(`⚠️ 无法找到容器 ${containerId} 的对话容器`);
    updateComponentStatus(containerId, side, '结构错误');
    return;
  }

  // console.log(`🔍 在对话容器中查找图片...`);
  // console.log(`🔍 对话容器HTML结构: ${dialogContainer.outerHTML.substring(0, 200)}...`);

  // 在同级对话容器中查找图片
  const imageInContainer = dialogContainer.querySelector('img[data-sentry-element="DynamicImage"]');

  if (!imageInContainer) {
    // console.log(`⚠️ 容器 ${containerId} 的对话容器中未找到图片，设置延迟重试...`);
    updateComponentStatus(containerId, side, '图片加载中...');

    // 延迟重试，等待图片加载
    setTimeout(() => {
      analyzeContainerImages(container, containerId);
    }, 3000);
    return;
  }

  // console.log(`✅ 在对话容器中找到图片，开始分析...`);
  // console.log(`🔍 图片URL: ${imageInContainer.src.substring(0, 100)}...`);

  // 分析找到的图片
  analyzeImage(imageInContainer, containerId, side);
}

// 分析单个图片
function analyzeImage(img, containerId, side) {
  // console.log(`🔍 分析图片 (${side})`);

  if (img.complete && img.naturalWidth > 0) {
    // 图片已加载完成
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const format = getImageFormat(img.src);
    // console.log(`✅ 图片 ${side}: ${width}x${height} 像素, 格式: ${format}`);

    updateComponentStatus(containerId, side, `${width}x${height} ${format}`);
  } else {
    // 图片还在加载中
    // console.log(`⏳ 图片 ${side}: 加载中...`);
    updateComponentStatus(containerId, side, '加载中...');

    // 监听图片加载完成
    img.addEventListener('load', () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const format = getImageFormat(img.src);
      console.log(`✅ 图片 ${side} 加载完成: ${width}x${height} 像素, 格式: ${format}`);
      updateComponentStatus(containerId, side, `${width}x${height} ${format}`);
    });

    // 监听图片加载失败
    img.addEventListener('error', () => {
      console.log(`❌ 图片 ${side} 加载失败`);
      updateComponentStatus(containerId, side, '加载失败');
    });
  }
}

// 从URL获取图片格式
function getImageFormat(url) {
  try {
    // 从URL参数或路径中提取格式
    const urlLower = url.toLowerCase();

    if (urlLower.includes('.png') || urlLower.includes('png')) return 'PNG';
    if (urlLower.includes('.jpg') || urlLower.includes('.jpeg') || urlLower.includes('jpeg')) return 'JPG';
    if (urlLower.includes('.webp') || urlLower.includes('webp')) return 'WebP';
    if (urlLower.includes('.gif') || urlLower.includes('gif')) return 'GIF';
    if (urlLower.includes('.bmp') || urlLower.includes('bmp')) return 'BMP';
    if (urlLower.includes('.svg') || urlLower.includes('svg')) return 'SVG';
    if (urlLower.includes('.avif') || urlLower.includes('avif')) return 'AVIF';
    if (urlLower.includes('.tiff') || urlLower.includes('tiff')) return 'TIFF';

    // 如果无法从URL判断，返回未知
    return '未知';
  } catch (error) {
    console.log(`⚠️ 获取图片格式失败: ${error.message}`);
    return '未知';
  }
}

// 更新组件状态
function updateComponentStatus(containerId, side, status) {
  const component = document.querySelector(`[data-container-id="${containerId}"]`);
  if (component) {
    const statusElement = component.querySelector(`[data-side="${side}"]`);
    if (statusElement) {
      statusElement.textContent = `${side === 'left' ? '左边' : '右边'}: ${status}`;

      // 根据状态设置颜色
      if (status.includes('成功')) {
        statusElement.style.color = '#059669'; // 绿色
      } else if (status.includes('失败')) {
        statusElement.style.color = '#dc2626'; // 红色
      } else if (status.includes('加载中')) {
        statusElement.style.color = '#d97706'; // 橙色
      }
    }
  }
}

// 获取当前状态
function getStatus() {
  const currentTime = Date.now();
  const elapsedTime = startTime ? currentTime - startTime : 0;
  const elapsedMinutes = Math.floor(elapsedTime / 60000);
  const elapsedSeconds = Math.floor((elapsedTime % 60000) / 1000);

  return {
    running: loopRunning,
    operationCount: operationCount,
    successfulDownloads: successfulDownloads,
    maxOperations: CONFIG.maxOperations,
    maxDownloads: CONFIG.maxDownloads,
    selectedPosition: selectedPosition,
    initialButtonCount: initialState.refreshButtonCount,
    elapsedTime: elapsedTime,
    elapsedTimeFormatted: `${elapsedMinutes}分${elapsedSeconds}秒`,
    successRate: operationCount > 0 ? Math.round((successfulDownloads / operationCount) * 100) : 0
  };
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);

  try {
    switch (request.action) {
      case 'startLoop':
        // 更新选择的位置
        if (request.position) {
          selectedPosition = request.position;
          console.log('更新选择位置:', selectedPosition);
        }
        // 获取停止条件参数
        const maxOperations = request.maxOperations || CONFIG.maxOperations;
        const maxDownloads = request.maxDownloads || CONFIG.maxDownloads;
        const startResult = startAutoRefresh(maxOperations, maxDownloads);
        sendResponse(startResult);
        break;

      case 'stopLoop':
        const stopResult = stopAutoRefresh();
        sendResponse(stopResult);
        break;

      case 'getStatus':
        const status = getStatus();
        sendResponse(status);
        break;

      case 'testClick':
        // 测试功能：手动点击一次刷新按钮
        if (request.position) {
          selectedPosition = request.position;
        }
        const refreshButton = findRefreshButton();
        if (refreshButton) {
          refreshButton.click();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: '未找到刷新按钮' });
        }
        break;

      case 'performAutoRefresh':
        // 执行自动刷新（避免Cloudflare会话过期）
        const refreshResult = performAutoRefresh();
        sendResponse(refreshResult);
        break;

      // 🔥 新增：日志管理相关消息
      case 'getLogs':
        const logs = getLogs(request.category, request.level, request.limit);
        sendResponse({ success: true, logs: logs });
        break;

      case 'clearLogs':
        const clearResult = clearLogs();
        sendResponse(clearResult);
        break;

      case 'exportLogs':
        const exportResult = exportLogs();
        sendResponse(exportResult);
        break;

      default:
        console.warn('未知的消息action:', request.action);
        sendResponse({ success: false, error: '未知的操作' });
        break;
    }
  } catch (error) {
    console.error('处理消息时发生错误:', error);
    sendResponse({ success: false, error: error.message });
  }

  return true; // 保持消息通道开放，支持异步响应
});

// 页面加载完成后的初始化
function initialize() {
  // 检查是否在正确的页面
  if (!window.location.href.includes('lmarena.ai')) {
    console.warn('当前页面不是lmarena.ai，插件可能无法正常工作');
    return;
  }

  // 🔥 新增：检测页面加载类型
  detectPageLoadType();

  // 🔥 新增：检测是否在Cloudflare验证页面
  if (isCloudflareVerificationPage()) {
    console.log('🔄 检测到Cloudflare验证页面，启用状态保护模式');
    enableCloudflareProtectionMode();

    // 🔥 新增：延迟再次尝试勾选，以防复选框是动态加载的
    setTimeout(() => {
      if (isCloudflareVerificationPage()) {
        console.log('🔄 延迟尝试自动勾选Cloudflare复选框...');
        attemptAutoCheckCloudflare();
      }
    }, 1000);

    return; // 在验证页面不执行其他初始化
  }

  // 检查是否需要恢复自动刷新状态
  checkAndRestoreAutoRefreshState();

  // 延迟检查自动启动，确保页面完全加载
  setTimeout(() => {
    checkAutoStart();
  }, 3000);

  // 注入插件分析组件
  if (injectPluginComponent()) {
    console.log('✅ 插件分析组件注入成功');
  } else {
    setTimeout(() => {
      injectPluginComponent();
    }, 2000);
  }

  // 设置组件持久化监听
  setupComponentPersistence();

  // 设置刷新按钮监听，用于重新分析图片
  setupRefreshButtonListener();
}

// 页面加载完成时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// 监听页面变化，在SPA路由变化时重新初始化
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('检测到页面路由变化:', url);
    setTimeout(initialize, 1000); // 延迟1秒重新初始化
  }
}).observe(document, { subtree: true, childList: true });
