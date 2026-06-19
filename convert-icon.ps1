
# Script para converter icon.png → icon.ico usando .NET
# Execute: powershell -ExecutionPolicy Bypass -File convert-icon.ps1

Add-Type -AssemblyName System.Drawing

$png = [System.Drawing.Image]::FromFile((Resolve-Path "assets\icon.png"))

# Redimensiona para 256x256 (tamanho ideal para ICO)
$bmp = New-Object System.Drawing.Bitmap(256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($png, 0, 0, 256, 256)
$g.Dispose()
$png.Dispose()

# Salva como ICO
$icoPath = "assets\icon.ico"
$stream  = [System.IO.File]::OpenWrite($icoPath)
$writer  = New-Object System.IO.BinaryWriter($stream)

# ICO header
$writer.Write([byte]0)          # reserved
$writer.Write([byte]0)
$writer.Write([int16]1)         # type: 1 = ICO
$writer.Write([int16]1)         # 1 image

# ICONDIRENTRY
$writer.Write([byte]0)          # width  (0 = 256)
$writer.Write([byte]0)          # height (0 = 256)
$writer.Write([byte]0)          # color count
$writer.Write([byte]0)          # reserved
$writer.Write([int16]1)         # planes
$writer.Write([int16]32)        # bit count
$writer.Write([int32]0)         # size (placeholder)
$writer.Write([int32]22)        # offset to image data

# Salva a imagem PNG dentro do ICO (Windows aceita PNG em ICO)
$pngStream = New-Object System.IO.MemoryStream
$bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()

# Volta e escreve o tamanho real
$stream.Seek(14, [System.IO.SeekOrigin]::Begin) | Out-Null
$writer.Write([int32]$pngBytes.Length)
$stream.Seek(0, [System.IO.SeekOrigin]::End) | Out-Null

$writer.Write($pngBytes)
$writer.Close()
$stream.Close()
$bmp.Dispose()

Write-Host "✅ Icon gerado em: $icoPath"
