import type { DeviceInfo } from '../types/auth.types'

/**
 * Parse user agent string to extract browser, OS, and device type
 */
export const parseUserAgent = (userAgent: string | null): DeviceInfo => {
  if (!userAgent) {
    return {
      browser: 'Unknown Browser',
      os: 'Unknown OS',
      device: 'Unknown Device',
    }
  }

  // Browser detection
  let browser = 'Unknown Browser'
  if (userAgent.includes('Firefox/')) {
    browser = 'Firefox'
  }
  else if (userAgent.includes('Edg/')) {
    browser = 'Edge'
  }
  else if (userAgent.includes('Chrome/')) {
    browser = 'Chrome'
  }
  else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    browser = 'Safari'
  }
  else if (userAgent.includes('Opera') || userAgent.includes('OPR/')) {
    browser = 'Opera'
  }

  // OS detection
  let os = 'Unknown OS'
  if (userAgent.includes('Windows NT 10')) {
    os = 'Windows 10/11'
  }
  else if (userAgent.includes('Windows NT')) {
    os = 'Windows'
  }
  else if (userAgent.includes('Mac OS X')) {
    os = 'macOS'
  }
  else if (userAgent.includes('Linux')) {
    if (userAgent.includes('Android')) {
      os = 'Android'
    }
    else {
      os = 'Linux'
    }
  }
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS'
  }
  else if (userAgent.includes('CrOS')) {
    os = 'Chrome OS'
  }

  // Device type detection
  let device = 'Desktop'
  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    device = 'Mobile'
  }
  else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
    device = 'Tablet'
  }

  return { browser, os, device }
}

/**
 * Get an icon name based on device type
 */
export const getDeviceIcon = (device: string): string => {
  switch (device.toLowerCase()) {
    case 'mobile':
      return 'i-lucide-smartphone'
    case 'tablet':
      return 'i-lucide-tablet'
    default:
      return 'i-lucide-monitor'
  }
}

/**
 * Get an icon name based on browser
 */
export const getBrowserIcon = (browser: string): string => {
  switch (browser.toLowerCase()) {
    case 'chrome':
      return 'i-simple-icons-googlechrome'
    case 'firefox':
      return 'i-simple-icons-firefox'
    case 'safari':
      return 'i-simple-icons-safari'
    case 'edge':
      return 'i-simple-icons-microsoftedge'
    case 'opera':
      return 'i-simple-icons-opera'
    default:
      return 'i-lucide-globe'
  }
}
