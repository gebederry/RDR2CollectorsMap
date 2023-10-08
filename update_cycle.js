const axios = require('axios')
const fs = require('fs')
const cron = require('croner')

// 设置定时任务，每天的02:00执行一次
cron('0 2 * * *', async () => {
  try {
    // 获取当前日期 yyyy-mm-dd
    const currentDate = new Date().toISOString().split('T')[0]

    const data = (await axios.get('https://api.rdo.gg/cycles/')).data
    // 在cycles数组中查找匹配当前日期的元素
    const matchingCycle = data.cycles.find((cycle) => {
      const cycleDate = new Date(cycle.startTime * 1000)
        .toISOString()
        .split('T')[0]
      return cycleDate === currentDate
    })

    if (matchingCycle) {
      // 添加日期属性
      matchingCycle.date = currentDate
      let existingData = JSON.parse(fs.readFileSync('data/cycles.json'))
      // 移除第一个元素
      existingData.shift()
      // 将处理后的数据追加到data.json中
      existingData.push(matchingCycle)
      // 写入更新后的数据到data.json文件中
      fs.writeFileSync(
        'data/cycles.json',
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
