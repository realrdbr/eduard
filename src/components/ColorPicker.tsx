
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Palette } from 'lucide-react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
}

// Predefined color presets in HSL format
const colorPresets = [
  { name: 'Weiß', value: '0 0% 100%' },
  { name: 'Schwarz', value: '222.2 84% 4.9%' },
  { name: 'Grau Hell', value: '210 40% 96.1%' },
  { name: 'Grau Dunkel', value: '217.2 32.6% 17.5%' },
  { name: 'Blau', value: '222.2 47.4% 11.2%' },
  { name: 'Cyan', value: '188 100% 33%' },
  { name: 'Grün', value: '120 60% 40%' },
  { name: 'Rot', value: '0 84.2% 60.2%' },
  { name: 'Orange', value: '25 95% 53%' },
  { name: 'Gelb', value: '60 90% 50%' },
  { name: 'Lila', value: '270 50% 40%' },
  { name: 'Pink', value: '330 60% 50%' }
];

// Convert HSL to hex for color input
const hslToHex = (hsl: string): string => {
  const match = hsl.match(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%/);
  if (!match) return '#000000';
  
  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Convert hex to HSL
const hexToHsl = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange, description }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hexValue = hslToHex(value);
  
  const handleHexChange = (hexColor: string) => {
    const hslValue = hexToHsl(hexColor);
    onChange(hslValue);
  };
  
  const handlePresetClick = (presetValue: string) => {
    onChange(presetValue);
    setIsOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="HSL Werte (z.B. 210 40% 98%)"
          className="font-mono text-sm flex-1"
        />
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-12 h-10 p-0 border-2"
              style={{ backgroundColor: `hsl(${value})` }}
            >
              <Palette className="h-4 w-4" style={{ color: `hsl(${value})` === 'hsl(0 0% 100%)' ? '#000' : '#fff' }} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="hex-input" className="text-sm font-medium">Hex-Farbe</Label>
                <input
                  id="hex-input"
                  type="color"
                  value={hexValue}
                  onChange={(e) => handleHexChange(e.target.value)}
                  className="w-full h-10 rounded border border-border cursor-pointer"
                />
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">Vordefinierte Farben</Label>
                <div className="grid grid-cols-4 gap-2">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => handlePresetClick(preset.value)}
                      className="w-12 h-12 rounded border-2 border-border hover:border-primary transition-colors"
                      style={{ backgroundColor: `hsl(${preset.value})` }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground">
                <div>Aktuell: <span className="font-mono">{value}</span></div>
                <div>Hex: <span className="font-mono">{hexValue}</span></div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
};
