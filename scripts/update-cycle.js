import fetch from 'node-fetch'
import { doPolling } from '@ilyagershman/easy-poll'
import fs from 'node:fs'
import cron from 'croner'
import jewOccCycles from '../dev/jewelry_occurence_cycles.json' assert { type: 'json' }

// 设置定时任务，每天的02:00执行一次
cron('0 2 * * *', async () => {
  try {
    // 获取当前日期 yyyy-mm-dd，UTC+8 时区
    const utc8Date = new Date()
    utc8Date.setUTCHours(utc8Date.getUTCHours() + 8)
    const currentDate = utc8Date.toISOString().split('T')[0]

    const data = await fetchJewelryTS()
    // 在cycles数组中查找匹配当前日期的元素
    const matchingCycle = data.cycles.find((cycle) => {
      const cycleDate = new Date(cycle.startTime * 1000)
        .toISOString()
        .split('T')[0]
      return cycleDate === currentDate
    })

    if (matchingCycle) {
      // 映射对象，将旧键名映射到新键名
      const keyMappings = {
        jewelry: 'lost_jewelry',
        card: 'tarot_cards',
        fossil: 'fossils',
        heirloom: 'heirlooms'
      }

      // 修改键名
      for (const oldKey in keyMappings) {
        if (matchingCycle.hasOwnProperty(oldKey)) {
          matchingCycle[keyMappings[oldKey]] = matchingCycle[oldKey]
          delete matchingCycle[oldKey]
        }
      }

      // 添加日期属性
      matchingCycle.date = currentDate

      let existingData = JSON.parse(
        fs.readFileSync('/var/www/map/data/cycles.json')
      )
      // 移除第一个元素
      existingData.shift()
      // 将处理后的数据追加到data.json中
      existingData.push(matchingCycle)
      // 写入更新后的数据到data.json文件中
      fs.writeFileSync(
        '/var/www/map/data/cycles.json',
        JSON.stringify(existingData, null, ' ')
      )
      console.log('数据已追加到 cycles.json 文件中')
    } else {
      console.log('未找到匹配日期的数据')
    }
  } catch (error) {
    console.error('发生错误：', error.message)
  }
})

// 获取随机遗失珠宝的时间戳
cron('44 59 7 * * *', async () => {
  let lastUpdated = null // 保存上次返回的 "updated" 字段的值
  let dynaInterval = 6000
  const intervalMap = { 60: 60000, 100: 120000, 200: 300000 } // 轮询次数与 dynaInterval

  const { data, error } = await doPolling(() => fetchJewelryTS(), {
    interval: () => dynaInterval,
    until: ({ data }) => {
      // 检查当前返回的 "updated" 字段的值是否与上次相同
      if (lastUpdated !== null && data.updated !== lastUpdated) return true
      lastUpdated = data.updated // 更新 lastUpdated 的值
      return false // 否则继续轮询
    },
    onStart: () => {
      console.debug('开始获取今日周期的 API 数据')
    },
    onNext: ({ attempt }) => {
      // 检查当前轮询次数是否在 intervalMap 中，如果是，则将 interval 设置为对应的值
      if (Object.prototype.hasOwnProperty.call(intervalMap, attempt)) {
        dynaInterval = intervalMap[attempt]
        console.info(`已发起轮询 ${attempt} 次, 下一次的轮询间隔将变更为 ${ dynaInterval / 1000 } 秒`) // prettier-ignore
      }

      console.debug('周期的 API 还未更新')
      return dynaInterval
    },
    onComplete: async (props) => {
      console.debug(`onComplete`, JSON.stringify(props, null, 2))
    },
    onError: (props) => {
      console.warn(`onError`, JSON.stringify(props, null, 2))
    }
  }).init()

  if (error) return
  console.info('今日的周期 API 已更新；轮询已停止')

  const currCycleST = data.cycles[1].startTime
  const staticSpawnTS = {
    updated: Math.floor(new Date().getTime() / 1000),
    items: getStaticSpawnTS(jewOccCycles, currCycleST, data.next_cycle_times)
  }
  fs.writeFileSync(
    '/var/www/map/data/jewelry_timestamps.json',
    JSON.stringify(staticSpawnTS, null, ' ')
  )
  console.info('随机遗失珠宝的固定位置时间戳数据已写入 jewelry_timestamps.json')
})

// Utils
const fetchJewelryTS = async () => {
  const url = 'https://api.rdo.gg/cycles/'
  return fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  }).then((response) => response.json())
}
/**
 * 将 jewOccCycles 中的每个值转换为与当前周期起始时间戳最接近的时间戳
 * @param {*} jewOccCycles - 包含道具周期信息的对象，键为道具名称，值为周期数组
 * @param {*} currCycleST - 当前周期的起始时间戳
 * @param {*} nextCycleT - 包含下一个周期起始时间戳的对象
 * @returns - 转换后的对象，键为道具名称，值为最接近的时间戳，如果周期数组为空则为 null
 */
function getStaticSpawnTS(jewOccCycles, currCycleST, nextCycleT) {
  const staticSpawnTS = {}

  for (const jewOccCycle in jewOccCycles) {
    const cycles = jewOccCycles[jewOccCycle]
    const nearestTS =
      cycles.length > 0
        ? cycles.reduce((nearest, cycle) => {
            const timestamp = nextCycleT.jewelry[`cycle_${cycle}`]
            return Math.abs(timestamp - currCycleST) <
              Math.abs(nearest - currCycleST)
              ? timestamp
              : nearest
          }, nextCycleT.jewelry[`cycle_${cycles[0]}`])
        : null

    staticSpawnTS[jewOccCycle] = nearestTS
  }

  return staticSpawnTS
}