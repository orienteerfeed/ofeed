export const getMinutesSecondsFromMilliseconds = (milliseconds: number) => {
  const minutes = Math.floor(milliseconds / 60000)
  const seconds = Math.floor((milliseconds - minutes * 60000) / 1000)
  return { minutes, seconds }
}

export const getMinutesSecondsFromSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const secondsLeft = seconds - minutes * 60
  return { minutes, seconds: secondsLeft }
}

export const formatTimeOrienteering = (seconds: number) => {
  const { minutes, seconds: secondsLeft } =
    getMinutesSecondsFromSeconds(seconds)
  return `${minutes}:${secondsLeft < 10 ? '0' : ''}${secondsLeft}`
}
