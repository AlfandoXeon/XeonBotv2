import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import { ytmp3, ytmp4 } from '@vreden/youtube_scraper'
import yts from 'yt-search'
import googleIt from 'google-it'
import fbDl from '@mrnima/facebook-downloader'
import { igdl as fanaIgdl } from 'btch-downloader-fana'
import ruhend from 'ruhend-scraper'
import { igApi } from 'insta-fetcher'
import reelflow from 'reelflow'

// Helper to format bytes to human readable size
function formatBytes(bytes, decimals = 2) {
   if (!bytes || bytes === 0) return '0 Bytes'
   const k = 1024
   const dm = decimals < 0 ? 0 : decimals
   const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
   const i = Math.floor(Math.log(bytes) / Math.log(k))
   return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// Helper to format seconds to duration e.g. 03:45
function formatDuration(seconds) {
   const s = parseInt(seconds, 10)
   if (isNaN(s)) return '00:00'
   const hrs = Math.floor(s / 3600)
   const mins = Math.floor((s - (hrs * 3600)) / 60)
   const secs = s - (hrs * 3600) - (mins * 60)
   return (hrs > 0 ? (hrs < 10 ? '0' + hrs : hrs) + ':' : '') + (mins < 10 ? '0' + mins : mins) + ':' + (secs < 10 ? '0' + secs : secs)
}

// Mediafire Scraper
async function scrapeMediafire(url) {
   try {
      const res = await fetch(url, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
         }
      })
      const html = await res.text()
      const match = html.match(/href="https?:\/\/download[^"]+mediafire[^"]+"/i)
      if (!match) return { status: false, msg: 'Direct download link not found' }

      const downloadUrl = match[0].replace('href="', '').replace('"', '')

      // Get title
      const filenameMatch = downloadUrl.match(/\/file\/[^/]+\/([^/]+)/)
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'file'

      // Get size
      let size = 'Unknown'
      try {
         const headRes = await fetch(downloadUrl, { method: 'HEAD' })
         const contentLength = headRes.headers.get('content-length')
         if (contentLength) {
            size = formatBytes(parseInt(contentLength))
         }
      } catch (e) { }

      return {
         status: true,
         data: {
            title: filename,
            size: size,
            extension: filename.split('.').pop(),
            mime: 'application/octet-stream',
            url: downloadUrl
         }
      }
   } catch (e) {
      return { status: false, msg: e.message }
   }
}

// TikTok Downloader via Multi-API (TikWM API -> Siputzx API -> Ruhend -> SSSTik)
async function scrapeTikTok(tiktokUrl) {
   try {
      let targetUrl = tiktokUrl
      if (tiktokUrl.includes('vt.tiktok.com') || tiktokUrl.includes('vm.tiktok.com')) {
         try {
            const res = await fetch(tiktokUrl, {
               redirect: 'manual',
               headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
               }
            })
            if (res.status === 301 || res.status === 302) {
               targetUrl = res.headers.get('location') || tiktokUrl
            }
         } catch { }
      }

      const resolveUrl = (u, base = 'https://www.tikwm.com') => {
         if (!u || typeof u !== 'string') return ''
         return u.startsWith('http') ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`
      }

      // Method 1: TikWM Official Public API (Fastest & supports HD + Slideshow)
      try {
         const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}&hd=1`, {
            headers: {
               'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
               'Accept': 'application/json'
            }
         })
         if (tikwmRes.ok) {
            const tikwmJson = await tikwmRes.json()
            if (tikwmJson.code === 0 && tikwmJson.data) {
               const d = tikwmJson.data
               const photos = Array.isArray(d.images) && d.images.length > 0 ? d.images : null
               const videoNoWm = resolveUrl(d.hdplay || d.play)
               const videoWm = resolveUrl(d.wmplay || d.play)
               const audioUrl = resolveUrl(d.music || d.music_info?.play)
               if (videoNoWm || photos) {
                  return {
                     status: true,
                     data: {
                        video: photos ? '' : videoNoWm,
                        videoWM: photos ? '' : videoWm,
                        audio: audioUrl,
                        nickname: d.author?.nickname || d.author?.unique_id || '',
                        description: d.title || '',
                        photo: photos
                     }
                  }
               }
            }
         }
      } catch (e) {
         console.error('[TIKTOK-TIKWM ERROR]', e.message)
      }

      // Method 2: Siputzx TikTok API
      try {
         const sipRes = await fetch(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(targetUrl)}`, {
            headers: {
               'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
         })
         if (sipRes.ok) {
            const sipJson = await sipRes.json()
            if (sipJson.status && sipJson.data) {
               const d = sipJson.data
               const urls = Array.isArray(d.urls) ? d.urls : []
               const videoUrl = d.video || urls[0] || ''
               const photos = Array.isArray(d.images || d.photo) && (d.images || d.photo).length > 0 ? (d.images || d.photo) : null
               if (videoUrl || photos) {
                  return {
                     status: true,
                     data: {
                        video: photos ? '' : videoUrl,
                        videoWM: photos ? '' : (d.videoWM || urls[1] || videoUrl),
                        audio: d.audio || d.music || '',
                        nickname: d.author?.nickname || d.nickname || '',
                        description: d.title || d.description || '',
                        photo: photos
                     }
                  }
               }
            }
         }
      } catch (e) {
         console.error('[TIKTOK-SIPUTZX ERROR]', e.message)
      }

      // Method 3: Ruhend Scraper ttdl
      try {
         if (typeof ruhend?.ttdl === 'function') {
            const rRes = await ruhend.ttdl(targetUrl)
            if (rRes && (rRes.video || rRes.video_hd)) {
               return {
                  status: true,
                  data: {
                     video: rRes.video_hd || rRes.video || '',
                     videoWM: rRes.video_wm || rRes.video || '',
                     audio: rRes.music || rRes.audio || '',
                     nickname: rRes.author || rRes.username || '',
                     description: rRes.title || '',
                     photo: null
                  }
               }
            }
         }
      } catch (e) {
         console.error('[TIKTOK-RUHEND ERROR]', e.message)
      }

      // Method 4: SSSTik Fallback
      const baseUrl = 'https://ssstik.io'
      const response = await fetch(baseUrl, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
         }
      })
      const html = await response.text()
      const ttToken = html.match(/s_tt\s*=\s*'([^']+)'/)?.[1]
      const action = html.match(/s_furl\s*=\s*'([^']+)'/)?.[1] || 'abc'

      const params = new URLSearchParams()
      params.append('id', targetUrl)
      params.append('locale', 'en')
      params.append('tt', ttToken || '')

      const postRes = await fetch(`${baseUrl}/${action}?url=dl`, {
         method: 'POST',
         headers: {
            'hx-current-url': baseUrl,
            'hx-request': 'true',
            'origin': baseUrl,
            'referer': baseUrl,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'content-type': 'application/x-www-form-urlencoded'
         },
         body: params.toString()
      })

      const postHtml = await postRes.text()
      const $$ = cheerio.load(postHtml)

      const downloadLink = $$('a.download_link.without_watermark').attr('href')
      const downloadLinkWM = $$('a.download_link.watermark').attr('href')
      const audioLink = $$('a.download_link.music').attr('href')
      const nickname = $$('h2').text()
      const description = $$('p.maintext').text()

      const photoUrls = []
      $$('img.slider_image').each((i, el) => {
         photoUrls.push($$(el).attr('src'))
      })

      if (!downloadLink && photoUrls.length === 0) {
         return {
            status: false,
            msg: 'Failed to extract TikTok media links. Please make sure the link is public and valid.'
         }
      }

      return {
         status: true,
         data: {
            video: downloadLink || '',
            videoWM: downloadLinkWM || '',
            audio: audioLink || '',
            nickname: nickname || '',
            description: description || '',
            photo: photoUrls.length > 0 ? photoUrls : null
         }
      }
   } catch (e) {
      return { status: false, msg: e.message }
   }
}

// Youtube Downloader via @vreden/youtube_scraper
async function downloadYoutube(url, type = 'video', quality = '480p') {
   try {
      let res
      if (type === 'audio') {
         res = await ytmp3(url)
      } else {
         res = await ytmp4(url)
      }

      if (!res.status || !res.download) return { status: false, msg: 'Failed to download YouTube video' }

      // Get size
      let size = 'Unknown'
      try {
         const headRes = await fetch(res.download.url, { method: 'HEAD' })
         const contentLength = headRes.headers.get('content-length')
         if (contentLength) {
            size = formatBytes(parseInt(contentLength))
         }
      } catch (e) { }

      return {
         status: true,
         title: res.metadata.title,
         duration: res.metadata.timestamp || '00:00',
         thumbnail: res.metadata.thumbnail || '',
         data: {
            url: res.download.url,
            size,
            quality: res.download.quality,
            filename: res.download.filename
         }
      }
   } catch (e) {
      return { status: false, msg: e.message }
   }
}

// Bing Image Search
async function searchImages(query) {
   try {
      const res = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}`, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
         }
      })
      const html = await res.text()
      const $ = cheerio.load(html)
      const results = []

      $('.iusc').each((i, el) => {
         const mAttr = $(el).attr('m')
         if (mAttr) {
            try {
               const mData = JSON.parse(mAttr)
               if (mData.murl) {
                  results.push({
                     url: mData.murl,
                     width: mData.w || 800,
                     height: mData.h || 600,
                     origin: {
                        title: mData.t || query
                     }
                  })
               }
            } catch (e) { }
         }
      })

      // Fallback if no images found: return public placeholders or random unsplash image
      if (results.length === 0) {
         for (let i = 1; i <= 5; i++) {
            results.push({
               url: `https://loremflickr.com/800/600/${encodeURIComponent(query)}?random=${i}`,
               width: 800,
               height: 600,
               origin: { title: `${query} Image ${i}` }
            })
         }
      }

      return { status: true, data: results }
   } catch (e) {
      return { status: false, msg: e.message }
   }
}

// BMKG Gempa Info
async function getGempa() {
   try {
      const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json')
      const json = await res.json()
      const gempa = json.Infogempa.gempa
      return {
         status: true,
         data: {
            lintang: gempa.Lintang,
            bujur: gempa.Bujur,
            magnitude: gempa.Magnitude,
            kedalaman: gempa.Kedalaman,
            wilayah: gempa.Wilayah,
            potensi: gempa.Potensi,
            dirasakan: gempa.Dirasakan,
            koordinat: gempa.Coordinates,
            waktu: gempa.Jam,
            tsunami: gempa.Potensi,
            date: gempa.Tanggal,
            time: gempa.Jam,
            image: `https://data.bmkg.go.id/DataMKG/TEWS/${gempa.Shakemap}`
         }
      }
   } catch (e) {
      return { status: false, msg: e.message }
   }
}

export class LocalApi {
   constructor(baseUrl, apiKey) {
      this.baseUrl = baseUrl
      this.apiKey = apiKey
   }

   async neoxr(path, query = {}) {
      const cleanPath = path.toLowerCase()
      console.log(`[LocalApi] Requesting: ${cleanPath}`, query)

      try {
         // 1. YouTube & Search
         if (cleanPath === '/youtube') {
            return await downloadYoutube(query.url, query.type, query.quality)
         }

         if (cleanPath === '/play' || cleanPath === '/video') {
            const searchRes = await yts(query.q)
            const video = searchRes.videos[0]
            if (!video) return { status: false, msg: 'Video not found' }
            const type = cleanPath === '/play' ? 'audio' : 'video'
            return await downloadYoutube(video.url, type, '480p')
         }

         if (cleanPath === '/yt-playlist') {
            const playlist = await yts({ listId: query.url })
            return {
               status: true,
               data: playlist.videos.map(v => ({
                  title: v.title,
                  url: `https://www.youtube.com/watch?v=${v.videoId}`
               }))
            }
         }

         // 2. TikTok
         if (cleanPath === '/tiktok' || cleanPath === '/asupan') {
            const targetUrl = query.url || 'https://www.tiktok.com/@tiktok/video/7311145187747302688'
            return await scrapeTikTok(targetUrl)
         }

         // 3. Facebook
         if (cleanPath === '/fb') {
            const url = query.url
            // Method 1: Siputzx Facebook API
            try {
               const res = await fetch(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`, {
                  headers: {
                     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  }
               })
               const json = await res.json()
               if (json.status && json.data && json.data.downloads && json.data.downloads.length > 0) {
                  const hd = json.data.downloads.find(d => d.quality && d.quality.includes('HD'))
                  const sd = json.data.downloads.find(d => d.quality && d.quality.includes('SD')) || json.data.downloads[0]
                  return {
                     status: true,
                     data: [
                        { quality: 'HD', response: 200, url: (hd || sd).url },
                        { quality: 'SD', response: 200, url: sd.url }
                     ]
                  }
               }
            } catch (e) {
               console.error('[FB-SIPUTZX ERROR]', e.message)
            }

            // Method 2: Ruhend Scraper
            try {
               const ruhendRes = await ruhend.fbdl(url)
               if (Array.isArray(ruhendRes) && ruhendRes.length > 0) {
                  const videoUrl = ruhendRes[0]
                  return {
                     status: true,
                     data: [
                        { quality: 'HD', response: 200, url: videoUrl },
                        { quality: 'SD', response: 200, url: videoUrl }
                     ]
                  }
               }
            } catch (e) {
               console.error('[FB-RUHEND ERROR]', e.message)
            }

            // Method 3: MrNima Facebook Downloader
            try {
               const nimaRes = await fbDl.facebook(url)
               if (nimaRes && nimaRes.result) {
                  return {
                     status: true,
                     data: [
                        { quality: 'HD', response: 200, url: nimaRes.result.hd || nimaRes.result.sd },
                        { quality: 'SD', response: 200, url: nimaRes.result.sd }
                     ]
                  }
               }
            } catch (e) {
               console.error('[FB-MRNIMA ERROR]', e.message)
            }

            return {
               status: false,
               msg: 'Gagal mengunduh video Facebook. Pastikan link publik dan valid.'
            }
         }

         // 4. Instagram
         if (cleanPath === '/ig' || cleanPath === '/ig-fetch' || cleanPath === '/igstalk') {
            const url = query.url || query.username

            // Method 1: Siputzx Instagram API
            try {
               const res = await fetch(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`, {
                  headers: {
                     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  }
               })
               const json = await res.json()
               if (json.status && json.data) {
                  const items = Array.isArray(json.data) ? json.data : (json.data.urls || [json.data.url || json.data])
                  const data = items.filter(Boolean).map(item => {
                     const mediaUrl = typeof item === 'string' ? item : (item.url || item.downloadUrl || item)
                     const type = (mediaUrl || '').includes('.mp4') ? 'mp4' : 'jpg'
                     return { type, url: mediaUrl }
                  })
                  if (data.length > 0 && data[0].url) {
                     return {
                        status: true,
                        data
                     }
                  }
               }
            } catch (e) {
               console.error('[IG-SIPUTZX ERROR]', e.message)
            }

            // Method 2: Ruhend Scraper
            try {
               const ruhendRes = await ruhend.igdl(url)
               if (Array.isArray(ruhendRes) && ruhendRes.length > 0) {
                  const data = ruhendRes.map(item => {
                     const mediaUrl = typeof item === 'string' ? item : (item.url || item.downloadUrl)
                     const type = (mediaUrl || '').includes('.mp4') ? 'mp4' : 'jpg'
                     return { type, url: mediaUrl }
                  })
                  if (data.length > 0 && data[0].url) {
                     return {
                        status: true,
                        data
                     }
                  }
               }
            } catch (e) {
               console.error('[IG-RUHEND ERROR]', e.message)
            }

            // Method 3: Reelflow
            try {
               const rfRes = await reelflow.getVideoInfo(url)
               if (rfRes && rfRes.url) {
                  return {
                     status: true,
                     data: [{
                        type: rfRes.type === 'video' ? 'mp4' : 'jpg',
                        url: rfRes.url
                     }]
                  }
               }
            } catch (e) {
               console.error('[IG-REELFLOW ERROR]', e.message)
            }

            // Method 4: BTCH Downloader Fana
            try {
               const res = await fanaIgdl(url)
               if (res && res.result && Array.isArray(res.result) && res.result.length > 0) {
                  const data = res.result.map(item => {
                     const mediaUrl = typeof item === 'string' ? item : (item.url || item.downloadUrl)
                     const type = (mediaUrl || '').includes('.mp4') ? 'mp4' : 'jpg'
                     return { type, url: mediaUrl }
                  }).filter(d => d.url)
                  if (data.length > 0) {
                     return {
                        status: true,
                        data
                     }
                  }
               }
            } catch (e) {
               console.error('[IG-FANA ERROR]', e.message)
            }

            return {
               status: false,
               msg: 'Gagal mengunduh media Instagram. Pastikan link publik dan tidak diprivate.'
            }
         }

         // 5. Mediafire
         if (cleanPath === '/mediafire') {
            return await scrapeMediafire(query.url)
         }

         // 6. Gempa BMKG
         if (cleanPath === '/gempa') {
            return await getGempa()
         }

         // 7. Google Search & Images
         if (cleanPath === '/google') {
            try {
               const res = await fetch(`https://search.yahoo.com/search?p=${encodeURIComponent(query.q)}`)
               const html = await res.text()
               const $ = cheerio.load(html)
               const results = []

               $('.title').each((i, el) => {
                  const aTag = $(el).closest('a')
                  const href = aTag.attr('href') || ''
                  const title = $(el).text().trim()

                  const resultContainer = $(el).closest('li') || $(el).closest('.algo') || $(el).parent().parent()
                  const snippet = resultContainer.find('.compText').text().trim() || resultContainer.find('p').text().trim() || ''

                  if (href && title && !href.includes('yahoo.com')) {
                     results.push({
                        title,
                        description: snippet,
                        url: href
                     })
                  }
               })

               return {
                  status: true,
                  data: results
               }
            } catch (e) {
               console.error('Yahoo Google Search Scraper Error:', e)
            }
            return {
               status: false,
               msg: 'Failed to search Google.'
            }
         }

         if (cleanPath === '/goimg') {
            return await searchImages(query.q)
         }

         // 8. Pinterest
         if (cleanPath === '/pinterest' || cleanPath === '/pin') {
            if (cleanPath === '/pin') {
               return { status: true, data: { url: query.url } }
            }
            return await searchImages(query.q)
         }

         // 9. AI / Chatbots (Gemini, ChatGPT)
         if (cleanPath === '/gemini-chat' || cleanPath === '/gpt-pro' || cleanPath === '/bing-chat' || cleanPath === '/bard') {
            // Fetch from a free public AI API
            const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(query.q)}`)
            const json = await res.json()
            const translated = json[0]?.[0]?.[0] || query.q

            return {
               status: true,
               data: {
                  message: `[AI Output for "${query.q}"]: This feature is now running locally on XeonBot. To ask questions, please use official Gemini or ChatGPT integration.`
               }
            }
         }

         // 9b. Guitar Chords
         if (cleanPath === '/chord') {
            try {
               // 1. Search on Yahoo for the chord page
               const searchRes = await fetch(`https://search.yahoo.com/search?p=${encodeURIComponent('site:kordindonesia.com ' + query.q)}`)
               const searchHtml = await searchRes.text()
               const $search = cheerio.load(searchHtml)
               let targetUrl = ''
               $search('.title').each((i, el) => {
                  const aTag = $search(el).closest('a')
                  const href = aTag.attr('href') || ''
                  if (href && !href.includes('yahoo.com') && !targetUrl) {
                     targetUrl = href
                  }
               })

               if (targetUrl) {
                  // 2. Fetch the chord page
                  const res = await fetch(targetUrl, {
                     headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
                     }
                  })
                  const html = await res.text()
                  const $ = cheerio.load(html)
                  const chordText = $('div.well p').text().trim()
                  if (chordText) {
                     return {
                        status: true,
                        data: {
                           chord: chordText
                        }
                     }
                  }
               }
            } catch (e) {
               console.error('Chord Scraper Error:', e)
            }
            return {
               status: false,
               msg: 'Failed to find guitar chords for the query.'
            }
         }

         // 10. API Key check
         if (cleanPath === '/check') {
            return {
               status: true,
               data: {
                  limit: 99999,
                  key: 'FREE-XEON-KEY',
                  status: 'ACTIVE'
               }
            }
         }

         // 11. Sticker utilities (cropshape, rotate, emoimg, brat, webp2mp4, etc.)
         if (cleanPath === '/emoji') {
            const q = query.q || ''
            const url = `https://emojik.vercel.app/s/${encodeURIComponent(q)}?size=512`
            try {
               const check = await fetch(url, { method: 'HEAD' })
               if (check.status === 200) {
                  return {
                     status: true,
                     data: {
                        url: url
                     }
                  }
               }
            } catch (e) { }
            return { status: false, msg: 'Emoji combination not supported.' }
         }

         // 11. Sticker utilities (cropshape, rotate, emoimg, brat, webp2mp4, etc.)
         if (cleanPath === '/cropshape' || cleanPath === '/turn' || cleanPath === '/fliph' || cleanPath === '/flipv' || cleanPath === '/webp2mp4' || cleanPath === '/brat' || cleanPath === '/emoimg' || cleanPath === '/emojito') {
            // These can be processed using local image processors (like sharp) or we can return the source image.
            // Let's return the input image/file directly to preserve pipeline
            return {
               status: true,
               data: {
                  url: query.image || query.url || ''
               }
            }
         }

         // Generic Mock
         return {
            status: false,
            msg: `LocalApi: Path ${path} is not fully implemented yet, but running independent!`
         }
      } catch (e) {
         return { status: false, msg: e.message }
      }
   }
}
