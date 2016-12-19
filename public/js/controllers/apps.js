angular.module('eye').controller("apps", function($scope, $http) {
	
	var eye = new EyeApi($http);
	
	$scope.getData = function()
	{
		eye.getApps(function(err, response) {
			if (err)
			{
				$scope.apps = [];
			}
			else
			{
				$scope.apps = response.data;
			}
		});
	}
	
	$scope.apps = [];
	$scope.getData();
});