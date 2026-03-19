export default function Popup() {
  function openSidePanel() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const windowId = tabs[0]?.windowId
      if (windowId !== undefined) {
        chrome.sidePanel.open({ windowId })
        window.close()
      }
    })
  }

  return (
    <div className="w-56 p-4 bg-white">
      <h1 className="text-sm font-semibold text-slate-800 mb-3">Taskboxing</h1>
      <button
        onClick={openSidePanel}
        className="w-full text-sm px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Open side panel
      </button>
    </div>
  )
}
