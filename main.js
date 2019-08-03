const { shell } = require('electron');
var { remote } = require('electron');
var { isMac, app, Menu, MenuItem } = remote;
const fs = require('fs');
const Store = require('electron-store');
const store = new Store();

// global variables
const json = loadSettings();
const menuModule = require('./menu');
const defaultChannel = 'general';
let uniqueIndex = 0;

// initialize function
initialize();

function initialize() {
  if(noSettings()) { return; }

  // create menu bar
  initializeMenu(menuModule.menuTemplate);

  // create div elements
  const contents = json.contents;
  contents.forEach(function(content, index) {
    initializeDiv(content['style'], content['width'], index);
  });

  // create webviews in div
  const webviews = getWebviews();
  webviews.forEach(function(webview, index) {
    webview.addEventListener('dom-ready', function() {
      initializeWebview(webview, contents[index]['channel']);
    });
  });
}
function initializeMenu(template) {
  let menu = Menu.buildFromTemplate(template);
  if (hasMultipleWorkspaces()) {
    const menuItemForWorkspaces = generateMenuItemForWorkspaces();
    menu.append(menuItemForWorkspaces);
  }

  const settingsMenu = generateSettingsMenu();
  menu.append(settingsMenu);

  Menu.setApplicationMenu(menu);
}
function incrementUniqueIndex() {
  uniqueIndex += 1;
}
function getUniqueIndex() {
  return uniqueIndex;
}
function hasMultipleWorkspaces () {
  return json.other_urls
}
function generateMenuItemForWorkspaces() {
  const menuItem = new MenuItem(
    { id: 'workspaces', label: 'Workspaces', submenu: [] }
  );
  const nameAndUrls = getOtherWorkspacesInfo(json.other_urls);
  const otherWorkspacesMenuItems = generateOtherWorkspaceMenuItems(nameAndUrls);

  otherWorkspacesMenuItems.forEach(function(owsMenuItem) {
    menuItem.submenu.append(owsMenuItem);
  });
  return menuItem;
}
function generateSettingsMenu() {
  const menuItem = new MenuItem(
    {
      id: 'settings',
      label: 'Settings',
      submenu: [
        {
          label: 'Import Settings',
          click(){ saveSettings(); }
        },
        {
          label: 'Clear Settings',
          click(){ clearStoredSettings(); }
        }
      ]
    }
  );

  return menuItem;
}
function generateOtherWorkspaceMenuItems(nameAndUrls) {
  const otherWorkspacesMenuItems = nameAndUrls.map(function(nameAndUrl) {
    return new MenuItem({
        label: nameAndUrl['name'],
        click(){ loadWorkspace(nameAndUrl['url']); }
      });
  });

  return otherWorkspacesMenuItems;
}
function getOtherWorkspacesInfo(other_urls) {
  const nameAndUrls = other_urls.map(function(url) {
    const workspaceName = new URL(url).hostname.replace(/.slack.com/g, '');
    return {'name': workspaceName, 'url': new URL(url)};
  });
  return nameAndUrls;
}
function getWebviews() {
  return Array.from(document.getElementsByTagName('webview'));
}
function getNumberOfWebviews() {
  return getWebviews().length;
}
function initializeWebview(webview, channel) {
  addKeyEvents(webview);
  registerToOpenUrl(webview, shell);
  setWebviewAutosize(webview, 'on');

  if (checkUrlIsDefault(webview)) {
    const channelUrl = getChannelUrl(json.url, channel);
    loadURL(webview, channelUrl);
  }

  const onlyBodyCss = getOnlyBodyCss();
  const onlyChannelCss = getOnlyChannelCss();
  const onlySidebarCss = getOnlySidebarCss();
  selectAplicableCss(webview, { onlyBodyCss, onlyChannelCss, onlySidebarCss });
}
// TODO: integrate with `initializeWebview`
function initializeWebviewForAnotherWorkspace(webview, workspaceUrl) {
  addKeyEvents(webview);
  registerToOpenUrl(webview, shell);
  setWebviewAutosize(webview, 'on');

  if (checkUrlIsDefault(webview)) {
    const channel = defaultChannel;
    const url = getChannelUrl(workspaceUrl, channel);
    loadURL(webview, url);
  }
}
function getOnlySidebarCss() {
  const disableChannelList = '.p-workspace__sidebar { display: none !important; }';
  const widenSidebar = '.p-workspace--context-pane-expanded { grid-template-columns: 0px auto 100% !important; }';
  const disableTeamHeader = '.p-classic_nav__team_header { display: none !important; }';
  const disableChannelHeader = '.p-classic_nav__channel_header { display: none !important; }';
  const disableBody = '.p-workspace__primary_view { display: none !important; }';
  return disableChannelList + widenSidebar+ disableTeamHeader + disableChannelHeader + disableBody;
}
function getOnlyChannelCss() {
  const disableBody = '.p-workspace__primary_view { display: none !important; }';
  const disableChannelHeader = '.p-classic_nav__channel_header { display: none !important; }';
  const disableRightHeader = '.p-classic_nav__right_header { display: none !important; }';
  const disableSidebar = '.p-workspace__secondary_view { display: none !important; }';
  return disableBody + disableChannelHeader + disableRightHeader + disableSidebar;
}
function getOnlyBodyCss() {
  const disableChannelList = '.p-workspace__sidebar { display: none !important; }';
  const disableTeamHeader = '.p-classic_nav__team_header { display: none !important; }';
  const widenBody = '.p-workspace--context-pane-collapsed { grid-template-columns: 0px auto !important; }';
  const adjustHeight = '.p-workspace--classic-nav { grid-template-rows: min-content 60px auto !important; }'
  const adjustLeftPadding = '.p-workspace--context-pane-expanded { grid-template-columns: 0px auto !important; }';
  return disableChannelList + widenBody + adjustHeight + disableTeamHeader + adjustLeftPadding;
}
function addKeyEvents(webview) {
  webview.getWebContents().on('before-input-event', (event, input) => {
    if(input.meta && input.key === '[' && webview.canGoBack()) { webview.goBack(); }
    // NOTE: canGoForward() and goForward() do not work somewhy....
    if(input.meta && input.key === ']' && webview.canGoForward()) { webview.goForward(); }
  });
}
function opendev() {
  const webviews = getWebviews();
  let webview = webviews[1];
  webview.openDevTools();
}
function reload(index) {
  const targetTab = document.getElementById(index);
  let webview = null;
  targetTab.children[0].childNodes.forEach(function(element) {
    if(element.tagName == 'WEBVIEW') { webview = element; }
  });
  webview.reload();
}
function remove(index) {
  let targetTab = document.getElementById(index);
  targetTab.parentNode.removeChild(targetTab);
}
function add() {
  const style = 'body-only';
  const width = 'large-tab';
  const channel = defaultChannel;
  const index = getUniqueIndex();
  initializeDiv(style, width, index);

  const webview = getWebviews()[getNumberOfWebviews() - 1];
  webview.addEventListener('dom-ready', function() {
    initializeWebview(webview, channel);
  });
}
function updateChannelNameIfNeeded(channelName, index) {
  if (!channelName) return;

  const displayName = channelName ? ('#' + channelName) : '';
  let targetTab = document.getElementById(index);
  let targetDiv = null;
  targetTab.children[0].childNodes.forEach(function(element) {
    if(element.className == 'tab-tool-bar') { targetDiv = element; }
  });
  targetDiv.children[1].innerHTML = displayName;
}
function loadWorkspace(workspaceUrl) {
  const style = 'full-view';
  const width = 'large-tab';
  const index = getUniqueIndex();
  initializeDiv(style, width, index);

  const webview = getWebviews()[getNumberOfWebviews() - 1];
  webview.addEventListener('dom-ready', function() {
    initializeWebviewForAnotherWorkspace(webview, workspaceUrl);
  });
}
function addButtons(div, index) {
  let divForButtons = div.children[0];
  divForButtons.innerHTML = `<button onclick=reload(${index});>Reload</button>`;
  divForButtons.innerHTML += `<button onclick=remove(${index});>Remove Column</button>`;
  divForButtons.innerHTML += '<button onclick=add();>Add Column</button>';
}
function initializeDiv(style, width, index) {
  const generatedDivs = generateTab(width, style);
  addButtons(generatedDivs['divTabToolBar'], getUniqueIndex());

  // update unique index
  incrementUniqueIndex();
}
function generateTab(width, style) {
  let divContainer = createContainerDiv(getUniqueIndex(), width);
  let divTabToolBar = createToolBarDiv();
  let divWebview = createWebviewDiv();
  let webview = createWebview(style);
  let root = getRootElement();

  root.appendChild(divContainer);
  divContainer.appendChild(divWebview);
  divWebview.appendChild(divTabToolBar);
  divWebview.appendChild(webview);

  return {
    divContainer: divContainer,
    divTabToolBar: divTabToolBar,
    divWebview: divWebview
  };
}
function getRootElement() {
  return document.getElementsByClassName('horizontal-list')[0];
}
function createContainerDiv(index, width) {
  let div = document.createElement('div');
  div.id = index;
  div.className = width;
  return div;
}
function createToolBarDiv() {
  let divTabToolBar = document.createElement('div');
  divTabToolBar.className = 'tab-tool-bar';

  let buttonDiv = document.createElement('div');
  buttonDiv.className = 'tab-tool-bar-button';
  divTabToolBar.appendChild(buttonDiv);

  let channelNameDiv = document.createElement('div');
  channelNameDiv.className = 'tab-tool-bar-channel';
  divTabToolBar.appendChild(channelNameDiv);

  return divTabToolBar;
}
function createWebviewDiv() {
  let divWebview = document.createElement('div');
  divWebview.className = 'webview';
  return divWebview;
}
function createWebview(style) {
  let webview = document.createElement('webview');
  webview.src = 'about:blank';
  webview.id = style;
  return webview;
}
function setWebviewAutosize(webview, autosize) {
  webview.autosize = autosize;
}
function selectAplicableCss(webview, { onlyBodyCss, onlyChannelCss, onlySidebarCss }) {
  if (shouldRenderOnlyBody(webview)) { applyCss(webview, onlyBodyCss); }
  if (shouldRenderOnlyChannelList(webview)) { applyCss(webview, onlyChannelCss); }
  if (shouldRenderOnlySidebar(webview)) { applyCss(webview, onlySidebarCss); }
}
function registerToOpenUrl(webview, shell) {
  // Hack: remove EventListener if already added
  webview.removeEventListener('new-window', openExternalUrl);
  webview.addEventListener('new-window', openExternalUrl);
}
function openExternalUrl(event){
  const url = event.url;
  // https://electronjs.org/docs/tutorial/security#14-do-not-use-openexternal-with-untrusted-content
  // Page 20 of https://www.blackhat.com/docs/us-17/thursday/us-17-Carettoni-Electronegativity-A-Study-Of-Electron-Security-wp.pdf
  if (url.startsWith('http://') || url.startsWith('https://')) {
    shell.openExternal(url);
  }
};
function getChannelUrl(baseUrl, channel) {
  const url = 'messages/' + channel;
  return new URL(url, baseUrl).href.toString();
}
function shouldRenderOnlyChannelList(webview) {
  return webview.id == 'channel-only';
}
function shouldRenderOnlyBody(webview) {
  return webview.id == 'body-only';
}
function shouldRenderOnlySidebar(webview) {
  return webview.id == 'sidebar-only';
}
function checkUrlIsDefault(webview) {
  return webview.attributes.src.value == 'about:blank';
}
function loadURL(webview, url) {
  webview.loadURL(url.toString());
}
function applyCss(webview, css) {
  webview.insertCSS(css);
}
function saveSettings() {
  openFileAndSave();
}
function openFileAndSave() {
  const win = remote.getCurrentWindow();
  remote.dialog.showOpenDialog(
    win,
    {
      properties: ['openFile'],
      filters: [{
        name: 'settings',
        extensions: ['json']
      }]
    },
    (filePath) => {
      if (filePath) { saveJson(filePath[0]); }
    }
  )
}
function saveJson(jsonPath) {
  const settings = JSON.parse(fs.readFileSync(jsonPath));
  if (!validateJson(settings)) { return null; }

  store.set(settings);
  forceReload();
}
function validateJson(jsonObj) {
  if (!jsonObj.url) {
    alert('jsonObj.url is invalid');
    return false;
  }
  if (!jsonObj.other_urls) {
    alert('jsonObj.other_urls is invalid');
    return false;
  }
  if (!jsonObj.contents) {
    alert('jsonObj.contents is invalid');
    return false;
  }

  return true;
}
function forceReload() {
  remote.getCurrentWindow().reload();
}
function clearStoredSettings() {
  store.clear();
  forceReload();
}
function loadSettings() {
  if (noSettings()) {
    saveSettings();
    return;
  }

  return buildJsonObjectFromStoredData();
}
function buildJsonObjectFromStoredData() {
  let jsonObj = {
    url: store.get('url'),
    other_urls: store.get('other_urls'),
    contents: store.get('contents')
  }
  if (!validateJson(jsonObj)) { return null; }

  return jsonObj;
}
function noSettings() {
  return store.size == 0;
}
