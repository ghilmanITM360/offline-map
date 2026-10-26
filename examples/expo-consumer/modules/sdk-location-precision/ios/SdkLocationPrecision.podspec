Pod::Spec.new do |s|
  s.name           = 'SdkLocationPrecision'
  s.version        = '0.0.0'
  s.summary        = 'Reads iOS location accuracy authorization for the SDK consumer.'
  s.description    = 'Capability reader only: never requests permission and never starts location updates.'
  s.author         = ''
  s.homepage       = 'https://example.invalid'
  s.license        = { :type => 'Apache-2.0' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.{h,m,mm,swift}'
end
