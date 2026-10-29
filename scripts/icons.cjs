const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
async function main() {
  const assets = path.join(__dirname, '../src/assets');
  const icon = path.join(assets, 'icon.svg');
  const iconset = path.join(__dirname, '../build/icon.iconset');
  await fs.mkdir(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      await sharp(icon).resize(size * scale).png().toFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
    }
  }
  await sharp(icon).resize(1024).png().toFile(path.join(assets, 'icon.png'));
  const { default: pngToIco } = await import('png-to-ico');
  await fs.writeFile(path.join(assets, 'icon.ico'), await pngToIco(await sharp(icon).resize(256).png().toBuffer()));
  const tray = await fs.readFile(path.join(assets, 'tray.svg'), 'utf8');
  for (const [variant, color] of [['black', '#000000'], ['white', '#ffffff']]) {
    const svg = Buffer.from(tray.replaceAll('#000000', color));
    await sharp(svg).resize(24).png().toFile(path.join(assets, `tray-${variant}.png`));
    await sharp(svg).resize(48).png().toFile(path.join(assets, `tray-${variant}@2x.png`));
    await fs.writeFile(path.join(assets, `tray-${variant}.ico`), await pngToIco(await sharp(svg).resize(256).png().toBuffer()));
  }
  // macOS tints template images to match the actual menu-bar appearance.
  await sharp(Buffer.from(tray)).resize(18).png().toFile(path.join(assets, 'trayTemplate.png'));
  await sharp(Buffer.from(tray)).resize(36).png().toFile(path.join(assets, 'trayTemplate@2x.png'));
  if (process.platform === 'darwin') execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(assets, 'icon.icns')]);
  console.log('Ícones gerados em src/assets.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
