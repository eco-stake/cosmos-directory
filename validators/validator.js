function Validator(data) {
  const { profile, chains } = data

  return {
    name: profile.name,
    profile,
    chains,
    data,
    ...data
  }
}

export default Validator
