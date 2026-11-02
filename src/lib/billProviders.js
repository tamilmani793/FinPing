// Who sends the bill. These are the starting lists for the Provider dropdown on a bill; you can add your own there
// (it is kept for next time) and edit them under Profile -> Customise.
export const ELECTRICITY_BOARDS = [
  'TNEB (TNPDCL)', 'BESCOM', 'MESCOM', 'HESCOM', 'GESCOM', 'CHESCOM', 'KSEB', 'TSSPDCL', 'TSNPDCL', 'APSPDCL', 'APEPDCL', 'APCPDCL',
  'MSEDCL (Mahavitaran)', 'Adani Electricity (Mumbai)', 'Tata Power', 'BEST (Mumbai)', 'Torrent Power', 'BSES Rajdhani', 'BSES Yamuna', 'Tata Power-DDL',
  'CESC (Kolkata)', 'WBSEDCL', 'DHBVN', 'UHBVN', 'PSPCL', 'UPPCL', 'Noida Power', 'MGVCL', 'UGVCL', 'DGVCL', 'PGVCL', 'JBVNL', 'NBPDCL', 'SBPDCL',
  'TPCODL', 'TPWODL', 'TPNODL', 'TPSODL', 'CSPDCL', 'MPPKVVCL', 'JVVNL', 'AVVNL', 'JdVVNL', 'PVVNL', 'HPSEBL', 'UPCL', 'JKPDD', 'Goa Electricity Dept',
]
export const GAS_PROVIDERS = ['Indane (Indian Oil)', 'HP Gas', 'Bharat Gas', 'Indraprastha Gas (IGL)', 'Mahanagar Gas (MGL)', 'Adani Total Gas', 'Gujarat Gas', 'Torrent Gas', 'Think Gas', 'Reliance BP']
export const MOBILE_PROVIDERS = ['Airtel', 'Jio', 'Vi (Vodafone Idea)', 'BSNL', 'MTNL']
export const BROADBAND_PROVIDERS = ['Airtel Xstream Fiber', 'JioFiber', 'ACT Fibernet', 'BSNL Bharat Fibre', 'Hathway', 'Tikona', 'Excitel', 'Spectra', 'You Broadband', 'Alliance Broadband', 'Tata Play Fiber', 'Vi Fiber']
export const OTHER_PROVIDERS = ['Tata Play', 'Dish TV', 'Sun Direct', 'Airtel Digital TV', 'd2h', 'Netflix', 'Amazon Prime', 'Disney+ Hotstar', 'JioCinema', 'SonyLIV', 'ZEE5', 'YouTube Premium', 'Metro Water Board', 'Municipal corporation', 'Housing society']

// which saved list a bill type uses
export const providerListKey = kind => (kind === 'electricity' ? 'electricityBoards' : kind === 'gas' ? 'gasProviders' : kind === 'mobile' ? 'mobileProviders' : kind === 'broadband' ? 'broadbandProviders' : 'otherBillProviders')
