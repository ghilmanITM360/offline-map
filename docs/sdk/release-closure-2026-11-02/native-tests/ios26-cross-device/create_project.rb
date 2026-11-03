require 'xcodeproj'
b=File.dirname(File.expand_path(__FILE__))
out=ARGV[0] || b
p=Xcodeproj::Project.new(File.join(out,'CrossDevice.xcodeproj'))
t=p.new_target(:ui_test_bundle, 'CrossDevice', :ios, '15.1')
t.source_build_phase.add_file_reference(p.main_group.new_file(File.join(b,'CrossDeviceJourney.swift')))
t.build_configurations.each do |c|
 c.build_settings['PRODUCT_BUNDLE_IDENTIFIER']='com.example.sdkacceptance.crossdevice'
 c.build_settings['SWIFT_VERSION']='5.0'
 c.build_settings['GENERATE_INFOPLIST_FILE']='YES'
 c.build_settings['CODE_SIGNING_ALLOWED']='NO'
 c.build_settings['TARGETED_DEVICE_FAMILY']='1,2'
end
p.save
s=Xcodeproj::XCScheme.new;s.add_build_target(t);s.add_test_target(t);s.save_as(p.path,'CrossDevice',true)
