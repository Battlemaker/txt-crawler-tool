const scrapeBtn = document.getElementById('scrapeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const chooseSavePath = document.getElementById('chooseSavePath');
const chapterLimit = document.getElementById('chapterLimit');
const chapterLimitLabel = document.getElementById('chapterLimitLabel');
const modeText = document.getElementById('modeText');
const startView = document.getElementById('startView');
const progressView = document.getElementById('progressView');
const resultView = document.getElementById('resultView');
const progressPanel = document.getElementById('progressPanel');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const progressBar = document.getElementById('progressBar');
const progressDetail = document.getElementById('progressDetail');
const result = document.getElementById('result');

let latestBook = null;
let latestDownloadUrl = '';
let activeRunId = '';

initializeStartView();

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'scrape-progress') {
    return;
  }

  if (message.runId !== activeRunId) {
    return;
  }

  updateProgress(message);
});

async function initializeStartView() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    const [res] = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      func: detectPageMode
    });

    applyPageMode(res && res.result ? res.result : { type: 'unknown' });
  } catch (err) {
    applyPageMode({ type: 'unknown' });
  }
}

function applyPageMode(mode) {
  if (mode.type === 'detail') {
    modeText.textContent = '目录页：将从第一章开始爬取';
    chapterLimitLabel.textContent = '爬取章节数';
    chapterLimit.placeholder = '留空为全部';
    return;
  }

  if (mode.type === 'chapter') {
    modeText.textContent = '正文页：将从当前章节开始爬取';
    chapterLimitLabel.textContent = '向后爬取章节数';
    chapterLimit.placeholder = '留空为当前章';
    return;
  }

  modeText.textContent = '当前页面：自动识别爬取起点';
  chapterLimitLabel.textContent = '爬取章节数';
  chapterLimit.placeholder = '留空为全部';
}

scrapeBtn.addEventListener('click', async () => {
  latestBook = null;
  activeRunId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  scrapeBtn.disabled = true;
  downloadBtn.disabled = true;
  showView('progress');
  resetProgress();

  const chapterLimitValue = getChapterLimit();
  result.textContent = '正在提取页面内容...';

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    const [res] = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      func: scrapePage,
      args: [activeRunId, chapterLimitValue]
    });

    if (!res || !res.result) {
      showView('result');
      result.textContent = '抓取失败';
      return;
    }

    const data = res.result;

    if (data.error) {
      showView('result');
      result.textContent = `抓取失败：${data.error}`;
      return;
    }

    latestBook = data;
    downloadBtn.disabled = !data.content;
    updateProgress({
      status: data.type === 'novel' && !data.completed ? '已停止' : '已完成',
      currentTitle: data.lastChapterTitle || data.title,
      currentChapterNumber: data.type === 'chapter'
        ? data.chapterCount || 0
        : data.lastChapterNumber || data.chapterCount || 0,
      done: data.chapterCount || 0,
      max: data.expectedChapterCount || data.chapterCount || 1,
      stopReason: data.stopReason || ''
    });
    result.textContent = formatPreview(data);
    showView('result');
  } catch (err) {
    showView('result');
    result.textContent = '错误：' + err.message;
  } finally {
    scrapeBtn.disabled = false;
  }
});

function showView(viewName) {
  startView.hidden = viewName !== 'start';
  progressView.hidden = viewName !== 'progress';
  resultView.hidden = viewName !== 'result';
}

function getChapterLimit() {
  const value = Number(chapterLimit.value);

  if (!Number.isInteger(value) || value < 1) {
    return 0;
  }

  return value;
}

downloadBtn.addEventListener('click', async () => {
  if (!latestBook || !latestBook.content) {
    result.textContent = '请先抓取成功后再保存 TXT 文件';
    return;
  }

  if (latestDownloadUrl) {
    URL.revokeObjectURL(latestDownloadUrl);
  }

  const blob = new Blob([formatTxt(latestBook)], {
    type: 'text/plain;charset=utf-8'
  });
  latestDownloadUrl = URL.createObjectURL(blob);

  try {
    await downloadFile({
      url: latestDownloadUrl,
      filename: `${sanitizeFileName(latestBook.title || 'novel')}.txt`,
      saveAs: chooseSavePath.checked
    });
    result.textContent = formatPreview(latestBook);
  } catch (err) {
    result.textContent = '保存失败：' + err.message;
  }
});

function resetProgress() {
  progressPanel.hidden = false;
  progressText.textContent = '准备中...';
  progressPercent.textContent = '0%';
  progressBar.value = 0;
  progressDetail.textContent = '';
}

function updateProgress(progress) {
  const max = Number(progress.max || 0);
  const done = Number(progress.done || 0);
  const currentChapterNumber = Number(progress.currentChapterNumber || 0);
  const current = currentChapterNumber || done;
  const percent = max ? Math.min(Math.round((current / max) * 100), 100) : 0;

  progressBar.value = percent;
  progressPercent.textContent = `${percent}%`;
  progressText.textContent = max
    ? `${progress.status || '爬取中'}：当前第 ${current}/${max} 章`
    : `${progress.status || '爬取中'}：已抓取 ${done} 章`;

  const detail = [];

  if (progress.currentTitle) {
    detail.push(progress.currentTitle);
  }

  if (done) {
    detail.push(`已保存 ${done} 章`);
  }

  if (progress.pageCount) {
    detail.push(`本章 ${progress.pageCount} 页`);
  }

  if (progress.stopReason) {
    detail.push(progress.stopReason);
  }

  progressDetail.textContent = detail.join('；');
}

function formatPreview(data) {
  const lines = [
    `书名：${data.title}`,
    `类型：${data.type === 'novel' ? '整本小说' : '单章节'}`,
    `已抓取章节数：${data.chapterCount || 1}`
  ];

  if (data.maxChapterNumber) {
    lines.push(`检测最大章节号：第${data.maxChapterNumber}章`);
  }

  if (data.expectedChapterCount) {
    lines.push(`预计章节数：${data.expectedChapterCount}`);
  }

  if (data.chapterLimit) {
    lines.push(`本次设置爬取章节数：${data.chapterLimit}`);
  }

  if (data.lastChapterTitle) {
    lines.push(`最后爬取章节：${data.lastChapterTitle}`);
  }

  if (data.completed === false) {
    lines.push('完成状态：未到达最终章节');
  }

  if (data.stopReason) {
    lines.push(`停止原因：${data.stopReason}`);
  }

  return `${lines.join('\n')}\n\n${data.content}`;
}

function formatTxt(data) {
  const lines = [data.title];

  if (data.maxChapterNumber) {
    lines.push(`检测最大章节号：第${data.maxChapterNumber}章`);
  }

  if (data.expectedChapterCount) {
    lines.push(`预计章节数：${data.expectedChapterCount}`);
  }

  if (data.chapterLimit) {
    lines.push(`本次设置爬取章节数：${data.chapterLimit}`);
  }

  if (data.completed === false) {
    lines.push('完成状态：未到达最终章节');
  }

  if (data.stopReason) {
    lines.push(`停止原因：${data.stopReason}`);
  }

  lines.push('', data.content);
  return lines.join('\n');
}

function downloadFile(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(downloadId);
    });
  });
}

function sanitizeFileName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'novel';
}

function detectPageMode() {
  const detailTitle = document.querySelector('.bookname');
  const readLink = document.querySelector('.btn-normal.abt2[href]');

  if (detailTitle && readLink) {
    return { type: 'detail' };
  }

  const titleEl = document.querySelector([
    '#chaptername',
    '.chaptername',
    '.bookname h1',
    '.chapter-title',
    '.read-title',
    '.word_read h3',
    '.content h1',
    '.reader h1',
    'h1'
  ].join(','));
  const contentEl = document.querySelector([
    '#txt',
    '#content',
    '#chaptercontent',
    '#chapterContent',
    '.word_read',
    '.txt',
    '.chapter-content',
    '.chapterContent',
    '.read-content',
    '.reader-content',
    '.article-content',
    '.book-content',
    '.readbox',
    '.reader'
  ].join(','));

  if (titleEl && contentEl) {
    return { type: 'chapter' };
  }

  return { type: 'unknown' };
}

async function scrapePage(runId, chapterLimit) {
  const detailTitle = document.querySelector('.bookname');
  const readLink = document.querySelector('.btn-normal.abt2[href]');

  if (detailTitle && readLink) {
    return scrapeNovelFromDetailPage(detailTitle, readLink);
  }

  return scrapeNovelFromChapterPage(location.href, document);

  async function scrapeNovelFromChapterPage(startUrl, initialDoc) {
    const expectedChapterCount = chapterLimit || 1;
    const maxChapters = Math.min(expectedChapterCount, 2000);
    const chapters = [];
    const visitedUrls = new Set();

    let currentUrl = startUrl;
    let lastChapterNumber = 0;
    let lastChapterTitle = '';
    let stopReason = '';
    let completed = false;

    postProgress({
      status: '开始爬取',
      currentTitle: document.title,
      done: 0,
      max: expectedChapterCount
    });

    for (let index = 0; index < maxChapters; index += 1) {
      if (!currentUrl) {
        stopReason = '没有下一章链接';
        break;
      }

      if (visitedUrls.has(currentUrl)) {
        stopReason = `链接重复，已停止：${currentUrl}`;
        break;
      }

      visitedUrls.add(currentUrl);

      const chapter = await scrapeChapter(currentUrl, index === 0 ? initialDoc : null);

      if (chapter.error) {
        stopReason = chapter.error;
        break;
      }

      if (!chapter.content) {
        stopReason = `正文为空：${currentUrl}`;
        break;
      }

      chapters.push(chapter);
      lastChapterNumber = getChapterNumber(chapter.title) || chapters.length;
      lastChapterTitle = formatChapterHeading(chapter.title, chapters.length);

      postProgress({
        status: '爬取中',
        currentTitle: lastChapterTitle,
        currentChapterNumber: chapters.length,
        pageCount: chapter.pageCount,
        done: chapters.length,
        max: expectedChapterCount
      });

      if (chapters.length >= expectedChapterCount) {
        completed = true;
        break;
      }

      currentUrl = chapter.nextChapterUrl;
    }

    if (chapters.length === 0) {
      return {
        error: stopReason || '当前阅读页面未抓取到正文'
      };
    }

    return {
      type: 'chapter',
      title: chapters[0].title || '无标题',
      chapterLimit,
      expectedChapterCount,
      chapterCount: chapters.length,
      lastChapterNumber,
      lastChapterTitle,
      completed,
      stopReason,
      content: chapters
        .map((chapter, index) =>
          `${formatChapterHeading(chapter.title, index + 1)}\n\n${chapter.content}`
        )
        .join('\n\n')
    };
  }

  async function scrapeNovelFromDetailPage(titleEl, startLink) {
    const title = getBookName(titleEl);
    const chapterStats = getChapterStats();
    const startReadUrl = new URL(startLink.getAttribute('href'), location.href).href;
    const detectedChapterCount = chapterStats.maxChapterNumber || 1000;
    const expectedChapterCount = chapterLimit || detectedChapterCount;
    const maxChapters = Math.min(expectedChapterCount, 2000);
    const chapters = [];
    const visitedUrls = new Set();

    let currentUrl = startReadUrl;
    let lastChapterNumber = 0;
    let lastChapterTitle = '';
    let startChapterNumber = 0;
    let progressMax = expectedChapterCount;
    let stopReason = '';
    let completed = false;

    postProgress({
      status: '开始爬取',
      currentTitle: title,
      done: 0,
      max: expectedChapterCount
    });

    for (let index = 0; index < maxChapters; index += 1) {
      if (!currentUrl) {
        stopReason = '没有下一章链接';
        break;
      }

      if (visitedUrls.has(currentUrl)) {
        stopReason = `链接重复，已停止：${currentUrl}`;
        break;
      }

      visitedUrls.add(currentUrl);

      const chapter = await scrapeChapter(currentUrl);

      if (chapter.error) {
        stopReason = chapter.error;
        break;
      }

      if (!chapter.content) {
        stopReason = `正文为空：${currentUrl}`;
        break;
      }

      chapters.push(chapter);
      lastChapterNumber = getChapterNumber(chapter.title) || chapters.length;
      lastChapterTitle = formatChapterHeading(chapter.title, chapters.length);

      if (!startChapterNumber) {
        startChapterNumber = lastChapterNumber;
        progressMax = chapterLimit && startChapterNumber
          ? startChapterNumber + chapterLimit - 1
          : expectedChapterCount;
      }

      postProgress({
        status: '爬取中',
        currentTitle: lastChapterTitle,
        currentChapterNumber: lastChapterNumber,
        pageCount: chapter.pageCount,
        done: chapters.length,
        max: progressMax
      });

      if (chapterLimit && chapters.length >= chapterLimit) {
        completed = true;
        break;
      }

      if (!chapterLimit && chapterStats.maxChapterNumber && lastChapterNumber >= chapterStats.maxChapterNumber) {
        completed = true;
        break;
      }

      currentUrl = chapter.nextChapterUrl;
    }

    if (chapters.length === 0) {
      return {
        error: stopReason || '开始阅读页面未抓取到正文'
      };
    }

    if (!completed) {
      stopReason = stopReason || '未到达检测到的最终章节';
    }

    return {
      type: 'novel',
      title,
      maxChapterNumber: chapterStats.maxChapterNumber,
      chapterLimit,
      expectedChapterCount,
      chapterCount: chapters.length,
      lastChapterNumber,
      lastChapterTitle,
      completed,
      stopReason,
      content: chapters
        .map((chapter, index) =>
          `${formatChapterHeading(chapter.title, index + 1)}\n\n${chapter.content}`
        )
        .join('\n\n')
    };
  }

  async function scrapeChapter(url, initialDoc) {
    const maxPages = 100;
    const visitedUrls = new Set();
    const contents = [];

    let currentUrl = url;
    let chapterTitle = '';
    let chapterKey = '';
    let nextChapterUrl = '';

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      if (visitedUrls.has(currentUrl)) {
        break;
      }

      visitedUrls.add(currentUrl);

      let doc;

      if (pageIndex === 0 && initialDoc) {
        doc = initialDoc;
      } else {
        try {
          doc = await fetchDocument(currentUrl);
        } catch (err) {
          return {
            error: `正文页请求失败：${currentUrl}，${err.message}`
          };
        }
      }

      const pageTitle = getChapterTitle(doc);
      const pageChapterKey = normalizeChapterTitle(pageTitle);

      if (!pageTitle) {
        return {
          error: `未找到章节标题：${currentUrl}`
        };
      }

      if (pageIndex === 0) {
        chapterTitle = pageChapterKey || pageTitle;
        chapterKey = pageChapterKey || pageTitle;
      } else if ((pageChapterKey || pageTitle) !== chapterKey) {
        nextChapterUrl = currentUrl;
        break;
      }

      const content = getContent(doc);

      if (content) {
        contents.push(content);
      }

      const nextUrl = getNextPageUrl(doc, currentUrl);

      if (!nextUrl) {
        break;
      }

      currentUrl = nextUrl;
    }

    return {
      title: chapterTitle || '无标题',
      pageCount: contents.length,
      content: contents.join('\n\n'),
      nextChapterUrl
    };
  }

  function postProgress(progress) {
    try {
      chrome.runtime.sendMessage({
        type: 'scrape-progress',
        runId,
        ...progress
      });
    } catch (err) {
      // The popup may be closed; scraping can continue without progress updates.
    }
  }

  async function fetchDocument(url) {
    const response = await fetch(url, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`请求失败：${response.status}`);
    }

    const html = await response.text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function getBookName(titleEl) {
    const heading = titleEl.querySelector('h1, h2, h3');
    return getElementText(heading || titleEl) || '无标题';
  }

  function getChapterStats() {
    const list = document.querySelector('ul.chapter-list');
    const items = list ? Array.from(list.querySelectorAll('li')).slice(0, 5) : [];
    const maxChapterNumber = items
      .map((item) => getChapterNumber(getElementText(item)))
      .reduce((max, chapterNumber) => Math.max(max, chapterNumber), 0);

    return {
      maxChapterNumber
    };
  }

  function getChapterNumber(text) {
    const match = text.match(/第\s*(\d+)\s*章/u);
    return match ? Number(match[1]) : 0;
  }

  function formatChapterHeading(title, fallbackNumber) {
    const cleanTitle = normalizeChapterTitle(title || '').trim();
    const match = cleanTitle.match(/^第\s*(\d+)\s*章\s*(.*)$/u);

    if (match) {
      const chapterName = match[2].trim();
      return chapterName ? `第${match[1]}章 ${chapterName}` : `第${match[1]}章`;
    }

    return cleanTitle ? `第${fallbackNumber}章 ${cleanTitle}` : `第${fallbackNumber}章`;
  }

  function getChapterTitle(doc) {
    const titleEl = doc.querySelector([
      '#chaptername',
      '.chaptername',
      '.bookname h1',
      '.chapter-title',
      '.read-title',
      '.word_read h3',
      '.content h1',
      '.reader h1',
      'h1'
    ].join(','));
    return getElementText(titleEl);
  }

  function normalizeChapterTitle(title) {
    return title
      .replace(/\s*[（(]\s*第\s*\d+\s*页\s*[）)]\s*$/u, '')
      .trim();
  }

  function getContent(doc) {
    const contentEl = doc.querySelector([
      '#txt',
      '#content',
      '#chaptercontent',
      '#chapterContent',
      '.word_read',
      '.txt',
      '.chapter-content',
      '.chapterContent',
      '.read-content',
      '.reader-content',
      '.article-content',
      '.book-content',
      '.readbox',
      '.reader'
    ].join(','));

    if (!contentEl) {
      return decodeQsbsContent(doc.documentElement.innerHTML || '');
    }

    const encodedContent = decodeQsbsContent(contentEl.innerHTML || '');

    if (encodedContent) {
      return encodedContent;
    }

    return getElementText(contentEl);
  }

  function getNextPageUrl(doc, baseUrl) {
    const scriptNextUrl = getScriptNextUrl(doc, baseUrl);

    if (scriptNextUrl) {
      return scriptNextUrl;
    }

    const siteNextLink = doc.querySelector('#pb_next[href]');

    if (siteNextLink) {
      return new URL(siteNextLink.getAttribute('href'), baseUrl).href;
    }

    const links = Array.from(doc.querySelectorAll('a[href]'));
    const nextLink = links.find((link) => {
      const text = getElementText(link).replace(/\s+/g, '');

      return (
        text === '下一页' ||
        text === '下页' ||
        text === '下一頁' ||
        text === '下一章' ||
        text === '下章' ||
        /^下一页[>＞]*$/u.test(text) ||
        /^下一章[>＞]*$/u.test(text)
      );
    });

    if (nextLink) {
      return new URL(nextLink.getAttribute('href'), baseUrl).href;
    }

    return getNextUrlByPageNumber(baseUrl);
  }

  function getScriptNextUrl(doc, baseUrl) {
    const scriptText = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent || '')
      .join('\n');
    const match = scriptText.match(/var\s+kkehvov\s*=\s*['"]([^'"]+)['"]/);

    if (!match || !match[1]) {
      return '';
    }

    return new URL(match[1], baseUrl).href;
  }

  function getNextUrlByPageNumber(baseUrl) {
    const url = new URL(baseUrl);
    const nextPath = url.pathname.replace(
      /_(\d+)(\.(?:html?|shtml?))$/i,
      (_, page, extension) => `_${Number(page) + 1}${extension}`
    );

    return nextPath === url.pathname ? '' : new URL(nextPath, url.origin).href;
  }

  function getElementText(element) {
    if (!element) {
      return '';
    }

    return (element.innerText || element.textContent || '').trim();
  }

  function decodeQsbsContent(html) {
    const matches = Array.from(
      html.matchAll(/qsbs\.bb\(\s*['"]([^'"]+)['"]\s*\)/g)
    );

    if (matches.length === 0) {
      return '';
    }

    return matches
      .map((match) => decodeBase64Html(match[1]))
      .filter(Boolean)
      .map((item) => htmlToText(item))
      .filter(Boolean)
      .join('\n');
  }

  function decodeBase64Html(value) {
    try {
      const binary = atob(value);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch (err) {
      return '';
    }
  }

  function htmlToText(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return (template.content.textContent || '').trim();
  }
}
