// Service Worker for Taskboxing Chrome Extension

console.log('Taskboxing service worker loaded')

// Open side panel when the toolbar icon is clicked (instead of popup)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Taskboxing installed:', details.reason)
  // Ensure side-panel-on-click is set after updates too
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

// Listen for messages from other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in service worker:', request)

  // Handle messages here
  if (request.type === 'SYNC_REQUEST') {
    // TODO: Implement sync logic
    sendResponse({ success: true })
  }

  return true // Keep message channel open for async response
})

// Set up periodic alarms for background sync
chrome.alarms.create('sync-alarm', {
  periodInMinutes: 15 // Sync every 15 minutes
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync-alarm') {
    console.log('Periodic sync triggered')
    // TODO: Implement periodic sync logic
  }
})

export {}
