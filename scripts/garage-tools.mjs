// Larger garages expose every section; compact garages use accessible tabs.
export async function selectGarageTool(page, tool) {
  const tab = page.locator(`#garage-tab-${tool}`);
  if (await tab.isVisible()) await tab.click();
}
