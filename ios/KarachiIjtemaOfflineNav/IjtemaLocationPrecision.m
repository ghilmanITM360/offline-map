// SPDX-License-Identifier: Apache-2.0
// Host-only capability reader. Never requests permission or starts location updates.
#import <CoreLocation/CoreLocation.h>
#import <React/RCTEventEmitter.h>
#import <os/log.h>

@interface IjtemaLocationPrecision : RCTEventEmitter <CLLocationManagerDelegate>
@end

@implementation IjtemaLocationPrecision {
  CLLocationManager *_manager;
  BOOL _observing;
  BOOL _invalidated;
}
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSArray<NSString *> *)supportedEvents { return @[@"locationPrecisionChanged"]; }
- (void)ensureManager {
  if (!_manager && !_invalidated) {
    _manager = [CLLocationManager new];
    _manager.delegate = self;
  }
}
- (void)startObserving { _observing = YES; [self ensureManager]; }
- (void)stopObserving { _observing = NO; }
- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
  if (_observing && !_invalidated) [self sendEventWithName:@"locationPrecisionChanged" body:nil];
}
RCT_EXPORT_METHOD(getSnapshot:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self ensureManager];
  // The global services query can block; do it away from the UI/manager queue.
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    BOOL services = [CLLocationManager locationServicesEnabled];
    dispatch_async(dispatch_get_main_queue(), ^{
      NSString *authorization = @"unknown";
      NSString *precision = @"none";
      if (!self->_invalidated && self->_manager) {
        CLAuthorizationStatus status = self->_manager.authorizationStatus;
        switch (status) {
          case kCLAuthorizationStatusAuthorizedWhenInUse: authorization = @"whenInUse"; break;
          case kCLAuthorizationStatusAuthorizedAlways: authorization = @"always"; break;
          case kCLAuthorizationStatusDenied: authorization = @"denied"; break;
          case kCLAuthorizationStatusRestricted: authorization = @"restricted"; break;
          case kCLAuthorizationStatusNotDetermined: authorization = @"notDetermined"; break;
          default: break;
        }
        if (services && (status == kCLAuthorizationStatusAuthorizedWhenInUse || status == kCLAuthorizationStatusAuthorizedAlways)) {
          switch (self->_manager.accuracyAuthorization) {
            case CLAccuracyAuthorizationFullAccuracy: precision = @"full"; break;
            case CLAccuracyAuthorizationReducedAccuracy: precision = @"reduced"; break;
            default: break;
          }
        }
      }
      // Capability-only diagnostics: no coordinates, device identifiers or fixes.
      os_log_info(OS_LOG_DEFAULT, "IjtemaLocationPrecision authorization=%{public}@ precision=%{public}@ services=%d", authorization, precision, services);
      resolve(@{@"authorization": authorization, @"precision": precision, @"servicesEnabled": @(services)});
    });
  });
}
- (void)invalidate {
  _invalidated = YES;
  _observing = NO;
  _manager.delegate = nil;
  _manager = nil;
  [super invalidate];
}
@end
