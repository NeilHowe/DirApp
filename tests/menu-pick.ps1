# 在已弹出的原生菜单里，用键盘把高亮移到指定文字的那一项，然后回车。
# 用法：menu-pick.ps1 -Text "打开"   或   -Text "复制路径"
param([string]$Text, [switch]$Esc)
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class MP {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(P p, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetMenuString(IntPtr menu, uint id, StringBuilder s, int n, uint flags);
  [DllImport("user32.dll")] static extern uint GetMenuState(IntPtr menu, uint id, uint flags);
  const uint MN_GETHMENU = 0x01E1, MF_BYPOSITION = 0x400, MF_HILITE = 0x80;
  public static IntPtr Menu() {
    IntPtr found = IntPtr.Zero;
    foreach (var pp in System.Diagnostics.Process.GetProcessesByName("dirapp")) {
      EnumWindows((h, l) => {
        uint p; GetWindowThreadProcessId(h, out p);
        if (p == (uint)pp.Id) { var sb = new StringBuilder(64); GetClassName(h, sb, 64);
          if (sb.ToString() == "#32768") found = h; }
        return true; }, IntPtr.Zero);
    }
    return found;
  }
  static IntPtr HMenu(IntPtr hwnd) { return SendMessage(hwnd, MN_GETHMENU, IntPtr.Zero, IntPtr.Zero); }
  public static string[] Labels(IntPtr hwnd) {
    var m = HMenu(hwnd); int n = GetMenuItemCount(m); var arr = new string[n];
    for (uint i = 0; i < n; i++) { var sb = new StringBuilder(512); int len = GetMenuString(m, i, sb, 512, MF_BYPOSITION);
      arr[i] = len > 0 ? sb.ToString() : ""; }
    return arr;
  }
  public static int Highlighted(IntPtr hwnd) {
    var m = HMenu(hwnd); int n = GetMenuItemCount(m);
    for (uint i = 0; i < n; i++) if ((GetMenuState(m, i, MF_BYPOSITION) & MF_HILITE) != 0) return (int)i;
    return -1;
  }
  public static void Key(IntPtr h, int vk) {
    PostMessage(h, 0x0100, (IntPtr)vk, IntPtr.Zero);
    PostMessage(h, 0x0101, (IntPtr)vk, IntPtr.Zero);
  }
}
"@
$h = [MP]::Menu()
if ($h -eq [IntPtr]::Zero) { "NO-MENU"; exit 1 }
if ($Esc) { [MP]::Key($h, 0x1B); "esc"; exit 0 }
$labels = [MP]::Labels($h)
function Norm([string]$s) { return (($s -replace '\(&.\)', '') -replace '&', '').Trim() }
# 上下移动，直到高亮项的**文字**和要选的一致（菜单里有禁用项，按编号算不准）
$hit = -1
for ($k = 0; $k -lt 90; $k++) {
  $idx = [MP]::Highlighted($h)
  if ($idx -ge 0 -and $idx -lt $labels.Count -and (Norm $labels[$idx]).StartsWith($Text)) { $hit = $idx; break }
  [MP]::Key($h, 0x28)   # VK_DOWN
  Start-Sleep -Milliseconds 30
}
if ($hit -lt 0) {
  "NOT-FOUND: " + ($labels | Where-Object { $_ } | ForEach-Object { Norm $_ }) -join ' | '
  [MP]::Key($h, 0x1B)
  exit 2
}
"picked at ${hit}: $($labels[$hit])"
[MP]::Key($h, 0x0D)     # VK_RETURN
