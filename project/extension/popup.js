document.getElementById('scrapeBtn').addEventListener('click', async () => {
  const result = document.getElementById('result');

  result.textContent = '正在提取当前章节...';

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    const [res] = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      func: scrapeCurrentChapter
    });

    if (!res || !res.result) {
      result.textContent = '抓取失败';
      return;
    }

    const data = res.result;

    if (data.error) {
      result.textContent = `抓取失败：${data.error}`;
      return;
    }

    result.textContent =
      `标题：${data.title}\n页数：${data.pageCount}\n\n${data.content}`;
  } catch (err) {
    result.textContent = '错误：' + err.message;
  }
});

async function scrapeCurrentChapter() {
  const maxPages = 100;
  const visitedUrls = new Set();
  const contents = [];

  let currentUrl = location.href;
  let chapterTitle = '';
  let chapterKey = '';

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (visitedUrls.has(currentUrl)) {
      break;
    }

    visitedUrls.add(currentUrl);

    let doc;

    if (pageIndex === 0) {
      doc = document;
    } else {
      try {
        doc = await fetchDocument(currentUrl);
      } catch (err) {
        break;
      }
    }

    const pageTitle = getChapterTitle(doc);
    const pageChapterKey = normalizeChapterTitle(pageTitle);

    if (!pageTitle) {
      return {
        error: '未找到章节标题 #chaptername'
      };
    }

    if (pageIndex === 0) {
      chapterTitle = pageChapterKey || pageTitle;
      chapterKey = pageChapterKey || pageTitle;
    } else if ((pageChapterKey || pageTitle) !== chapterKey) {
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
    content: contents.join('\n\n')
  };

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

  function getChapterTitle(doc) {
    const titleEl = doc.querySelector('#chaptername');
    return getElementText(titleEl);
  }

  function normalizeChapterTitle(title) {
    return title
      .replace(/\s*[（(]\s*第\s*\d+\s*页\s*[）)]\s*$/u, '')
      .trim();
  }

  function getContent(doc) {
    const contentEl = doc.querySelector('#txt');

    if (!contentEl) {
      return '';
    }

    const encodedContent = decodeQsbsContent(contentEl.innerHTML || '');

    if (encodedContent) {
      return encodedContent;
    }

    return getElementText(contentEl);
  }

  function getNextPageUrl(doc, baseUrl) {
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
        /^下一页[>＞]*$/u.test(text)
      );
    });

    if (nextLink) {
      return new URL(nextLink.getAttribute('href'), baseUrl).href;
    }

    return getNextUrlByPageNumber(baseUrl);
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
