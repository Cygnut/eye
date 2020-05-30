angular.module('eye').controller("maintenance", function($scope, $http) {
    
    var eye = new EyeApi($http);
    
    $scope.getData = function()
    {
        eye.getMaintenance(function(err, response) {
            if (err)
            {
                $scope.items = {};
            }
            else
            {
                delete response.data["repo"];
                $scope.items = response.data;
            }
        });
    }
    
    $scope.items = {};
    $scope.getData();
});